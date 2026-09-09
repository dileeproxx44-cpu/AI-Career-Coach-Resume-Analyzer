/**
 * CareerAI - Frontend Application Logic
 * Communicates with Flask backend via Fetch API.
 * Handles tab navigation, form submissions, PDF drag-and-drop, and AI response formatting.
 */

document.addEventListener('DOMContentLoaded', () => {
    initNavigationTabs();
    initCareerForm();
    initResumeForm();
    initDropzone();
});

/* ==========================================================================
   Global Helper Functions
   ========================================================================== */

function showAlert(message) {
    const alertBox = document.getElementById('global-alert');
    const alertMessage = document.getElementById('alert-message');
    if (alertBox && alertMessage) {
        alertMessage.textContent = message;
        alertBox.classList.remove('hidden');
        alertBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

function closeAlert() {
    const alertBox = document.getElementById('global-alert');
    if (alertBox) {
        alertBox.classList.add('hidden');
    }
}

/* ==========================================================================
   Navigation Tabs Logic
   ========================================================================== */

function initNavigationTabs() {
    const navButtons = document.querySelectorAll('.nav-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    navButtons.forEach(button => {
        button.addEventListener('click', () => {
            const targetTabId = button.getAttribute('data-tab');

            // Deactivate all buttons & contents
            navButtons.forEach(btn => btn.classList.remove('active'));
            tabContents.forEach(content => content.classList.remove('active-content'));

            // Activate target button & content
            button.classList.add('active');
            const targetContent = document.getElementById(targetTabId);
            if (targetContent) {
                targetContent.classList.add('active-content');
            }

            // Close any open alert messages
            closeAlert();
        });
    });
}

/* ==========================================================================
   AI Career Coach Form Logic
   ========================================================================== */

function initCareerForm() {
    const form = document.getElementById('career-form');
    const submitBtn = document.getElementById('btn-generate-career');
    const emptyState = document.getElementById('career-empty-state');
    const loadingState = document.getElementById('career-loading');
    const outputContainer = document.getElementById('career-output');

    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        closeAlert();

        const formData = {
            name: document.getElementById('name').value.trim(),
            education: document.getElementById('education').value.trim(),
            skills: document.getElementById('skills').value.trim(),
            experience_level: document.getElementById('experience_level').value,
            target_role: document.getElementById('target_role').value.trim(),
            study_hours: document.getElementById('study_hours').value.trim(),
            career_goal: document.getElementById('career_goal').value.trim()
        };

        if (!formData.name || !formData.target_role) {
            showAlert('Full Name and Target Role are required fields.');
            return;
        }

        // UI Loading Transition
        emptyState.classList.add('hidden');
        outputContainer.classList.add('hidden');
        loadingState.classList.remove('hidden');
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processing...';

        try {
            const response = await fetch('/career', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(formData)
            });

            const result = await response.json();

            if (response.ok && result.status === 'success') {
                renderFormattedAIResponse(result.data, outputContainer);
                loadingState.classList.add('hidden');
                outputContainer.classList.remove('hidden');
            } else {
                throw new Error(result.message || 'Failed to generate career guidance.');
            }
        } catch (error) {
            loadingState.classList.add('hidden');
            emptyState.classList.remove('hidden');
            showAlert(error.message);
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> Generate Career Guidance';
        }
    });
}

/* ==========================================================================
   AI Resume Analyzer Form & File Dropzone Logic
   ========================================================================== */

function initDropzone() {
    const dropzone = document.getElementById('dropzone');
    const fileInput = document.getElementById('resume_file');
    const preview = document.getElementById('file-preview');
    const content = dropzone ? dropzone.querySelector('.dropzone-content') : null;
    const fileNameEl = document.getElementById('file-name');
    const fileSizeEl = document.getElementById('file-size');
    const removeBtn = document.getElementById('btn-remove-file');

    if (!dropzone || !fileInput) return;

    ['dragenter', 'dragover'].forEach(eventName => {
        dropzone.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropzone.classList.add('dragover');
        });
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropzone.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropzone.classList.remove('dragover');
        });
    });

    dropzone.addEventListener('drop', (e) => {
        const files = e.dataTransfer.files;
        if (files && files.length > 0) {
            fileInput.files = files;
            updateFilePreview(files[0]);
        }
    });

    fileInput.addEventListener('change', () => {
        if (fileInput.files && fileInput.files.length > 0) {
            updateFilePreview(fileInput.files[0]);
        }
    });

    if (removeBtn) {
        removeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            fileInput.value = '';
            preview.classList.add('hidden');
            if (content) content.classList.remove('hidden');
        });
    }

    function updateFilePreview(file) {
        if (!file) return;

        if (!file.name.toLowerCase().endsWith('.pdf')) {
            showAlert('Please select a PDF file.');
            fileInput.value = '';
            return;
        }

        fileNameEl.textContent = file.name;
        fileSizeEl.textContent = formatBytes(file.size);
        if (content) content.classList.add('hidden');
        preview.classList.remove('hidden');
        closeAlert();
    }

    function formatBytes(bytes, decimals = 1) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    }
}

function initResumeForm() {
    const form = document.getElementById('resume-form');
    const submitBtn = document.getElementById('btn-analyze-resume');
    const emptyState = document.getElementById('resume-empty-state');
    const loadingState = document.getElementById('resume-loading');
    const outputContainer = document.getElementById('resume-output');
    const fileInput = document.getElementById('resume_file');

    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        closeAlert();

        if (!fileInput.files || fileInput.files.length === 0) {
            showAlert('Please upload a PDF resume file.');
            return;
        }

        const targetRole = document.getElementById('resume_target_role').value.trim();
        if (!targetRole) {
            showAlert('Please enter your Target Job Role.');
            return;
        }

        const formData = new FormData();
        formData.append('resume', fileInput.files[0]);
        formData.append('target_role', targetRole);
        formData.append('experience_level', document.getElementById('resume_experience_level').value);

        // UI Loading Transition
        emptyState.classList.add('hidden');
        outputContainer.classList.add('hidden');
        loadingState.classList.remove('hidden');
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Analyzing...';

        try {
            const response = await fetch('/resume', {
                method: 'POST',
                body: formData
            });

            const result = await response.json();

            if (response.ok && result.status === 'success') {
                renderFormattedAIResponse(result.data, outputContainer);
                loadingState.classList.add('hidden');
                outputContainer.classList.remove('hidden');
            } else {
                throw new Error(result.message || 'Failed to analyze resume.');
            }
        } catch (error) {
            loadingState.classList.add('hidden');
            emptyState.classList.remove('hidden');
            showAlert(error.message);
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fa-solid fa-magnifying-glass-chart"></i> Analyze Resume';
        }
    });
}

/* ==========================================================================
   AI Response Parser & Renderer
   Converts raw text/markdown into structured HTML cards with icons and tags.
   ========================================================================== */

function renderFormattedAIResponse(rawText, container) {
    if (!rawText || !container) return;

    container.innerHTML = '';

    // Split text by section numbers (e.g., "1. ", "2. ", "### 1. ")
    const lines = rawText.split('\n');
    let currentSectionTitle = 'Overview & Guidance';
    let currentContent = [];
    const sections = [];

    const sectionHeaderRegex = /^#*\s*(\d+[\.\)]\s+.*)/;

    lines.forEach(line => {
        const match = line.match(sectionHeaderRegex);
        if (match) {
            if (currentContent.length > 0) {
                sections.push({
                    title: currentSectionTitle,
                    content: currentContent.join('\n')
                });
            }
            currentSectionTitle = match[1].replace(/^\d+[\.\)]\s*/, '').trim();
            currentContent = [];
        } else {
            currentContent.push(line);
        }
    });

    if (currentContent.length > 0) {
        sections.push({
            title: currentSectionTitle,
            content: currentContent.join('\n')
        });
    }

    if (sections.length === 0) {
        // Fallback simple rendering if no clear numbered headings
        const div = document.createElement('div');
        div.className = 'output-section';
        div.innerHTML = parseMarkdownToHTML(rawText);
        container.appendChild(div);
        return;
    }

    sections.forEach(sec => {
        if (!sec.title && !sec.content.trim()) return;

        const sectionCard = document.createElement('div');
        sectionCard.className = 'output-section';

        const titleEl = document.createElement('h3');
        titleEl.innerHTML = `<i class="fa-solid fa-circle-check"></i> ${escapeHTML(sec.title)}`;

        const contentEl = document.createElement('div');
        contentEl.innerHTML = parseMarkdownToHTML(sec.content);

        sectionCard.appendChild(titleEl);
        sectionCard.appendChild(contentEl);
        container.appendChild(sectionCard);
    });
}

function parseMarkdownToHTML(markdownText) {
    if (!markdownText) return '';

    let html = markdownText;

    // Bold text (**text** or __text__)
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/__(.*?)__/g, '<strong>$1</strong>');

    // Italic text (*text*)
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');

    // Convert bullet lists (- or *)
    const lines = html.split('\n');
    let inList = false;
    let resultLines = [];

    lines.forEach(line => {
        const trimmed = line.trim();
        if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
            if (!inList) {
                inList = true;
                resultLines.push('<ul>');
            }
            const itemText = trimmed.replace(/^[\-\*]\s+/, '');
            resultLines.push(`<li>${itemText}</li>`);
        } else if (/^\d+[\.\)]\s+/.test(trimmed)) {
            // Numbered item inside text
            if (!inList) {
                inList = true;
                resultLines.push('<ul>');
            }
            const itemText = trimmed.replace(/^\d+[\.\)]\s+/, '');
            resultLines.push(`<li>${itemText}</li>`);
        } else {
            if (inList) {
                inList = false;
                resultLines.push('</ul>');
            }
            if (trimmed.length > 0) {
                resultLines.push(`<p>${trimmed}</p>`);
            }
        }
    });

    if (inList) {
        resultLines.push('</ul>');
    }

    return resultLines.join('');
}

function escapeHTML(str) {
    return str.replace(/[&<>'"]/g, 
        tag => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[tag] || tag)
    );
}
