import os
import json
import io
from datetime import datetime
from flask import Flask, render_template, request, jsonify
from dotenv import load_dotenv
import pypdf

# Load environment variables from .env file
ENV_PATH = os.path.join(os.path.dirname(__file__), '.env')
load_dotenv(dotenv_path=ENV_PATH)

app = Flask(__name__)

# Ensure data directory exists
DATA_DIR = os.path.join(os.path.dirname(__file__), 'data')
USERS_FILE = os.path.join(DATA_DIR, 'users.json')
ANALYSIS_FILE = os.path.join(DATA_DIR, 'analysis.json')

os.makedirs(DATA_DIR, exist_ok=True)

# Initialize storage files if they don't exist
for filepath in [USERS_FILE, ANALYSIS_FILE]:
    if not os.path.exists(filepath):
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump([], f, indent=2)

import time

def get_gemini_client():
    """Returns initialized Gemini client or error message if API key is invalid."""
    # Force reload .env so changes are picked up immediately
    load_dotenv(dotenv_path=ENV_PATH, override=True)
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    if not api_key or api_key == "your_api_key":
        return None, "Gemini API Key is not configured. Please update your .env file with a valid GEMINI_API_KEY."
    
    try:
        from google import genai
        client = genai.Client(api_key=api_key)
        return client, None
    except Exception as e:
        # Fallback check for google-generativeai legacy package if installed
        try:
            import google.generativeai as legacy_genai
            legacy_genai.configure(api_key=api_key)
            class LegacyWrapper:
                def generate_content(self, prompt):
                    model = legacy_genai.GenerativeModel('gemini-1.5-flash')
                    res = model.generate_content(prompt)
                    return res.text
            return LegacyWrapper(), None
        except Exception:
            return None, f"Failed to initialize Gemini API client: {str(e)}"

def call_gemini_ai(prompt):
    """Calls Gemini API with the given prompt and returns response text."""
    client, error = get_gemini_client()
    if error:
        return None, error

    # Active Gemini models in preference order
    models_to_try = [
        'gemini-3.6-flash',
        'gemini-3.5-flash',
        'gemini-3.5-flash-lite',
        'gemini-flash-latest'
    ]
    
    last_exception = None
    for model_name in models_to_try:
        # Retry up to 3 attempts per model for transient errors (e.g. 503 UNAVAILABLE / 429)
        for attempt in range(3):
            try:
                if hasattr(client, 'models'):
                    # Using google-genai SDK
                    response = client.models.generate_content(
                        model=model_name,
                        contents=prompt,
                    )
                    if response and response.text:
                        return response.text, None
                else:
                    # Using LegacyWrapper
                    res_text = client.generate_content(prompt)
                    if res_text:
                        return res_text, None
            except Exception as e:
                err_str = str(e)
                print(f"Model {model_name} (attempt {attempt + 1}) failed: {err_str}")
                last_exception = e
                # If 503 UNAVAILABLE or 429, wait briefly and retry before giving up on model
                if ("503" in err_str or "UNAVAILABLE" in err_str or "429" in err_str) and attempt < 2:
                    time.sleep(1.5 * (attempt + 1))
                    continue
                # If 404 or other non-transient error, move to next fallback model immediately
                break

    return None, f"AI generation error: {str(last_exception)}"

def load_json_records(filepath):
    """Safely load JSON array records from file."""
    try:
        if os.path.exists(filepath):
            with open(filepath, 'r', encoding='utf-8') as f:
                return json.load(f)
    except Exception as e:
        print(f"Error loading {filepath}: {e}")
    return []

def append_json_record(filepath, record):
    """Append a record to a JSON array file."""
    records = load_json_records(filepath)
    records.append(record)
    try:
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(records, f, indent=2, ensure_ascii=False)
    except Exception as e:
        print(f"Error saving to {filepath}: {e}")

@app.route('/')
def index():
    """Render main application UI."""
    return render_template('index.html')

@app.route('/career', methods=['POST'])
def career_coach():
    """
    Endpoint for AI Career Guidance generation.
    Expects JSON payload with student profile data.
    """
    try:
        data = request.get_json() or {}
        
        name = data.get('name', '').strip()
        education = data.get('education', '').strip()
        skills = data.get('skills', '').strip()
        experience_level = data.get('experience_level', '').strip()
        career_goal = data.get('career_goal', '').strip()
        target_role = data.get('target_role', '').strip()
        study_hours = data.get('study_hours', '').strip()

        if not name or not target_role:
            return jsonify({
                "status": "error",
                "message": "Full Name and Target Role are required fields."
            }), 400

        # Construct AI Career Coach Prompt as specified
        prompt = f"""Act as an expert AI Career Mentor.

Student Information:

Name:
{name}

Education:
{education}

Skills:
{skills}

Experience Level:
{experience_level}

Career Goal:
{career_goal}

Target Role:
{target_role}

Available Study Hours:
{study_hours}

Analyze the student profile.

Provide:

1. Career Profile Summary
2. 5 Suitable Job Roles
3. Current Strengths
4. Missing Skills for Target Role
5. Personalized Learning Roadmap
6. 3 Recommended Projects
7. Interview Preparation Topics
8. Career Improvement Tips

Rules:

Give personalized suggestions.

Do not invent skills.

Keep the explanation simple.

Give practical suggestions for students and freshers."""

        # Call Gemini AI
        ai_response, ai_error = call_gemini_ai(prompt)

        if ai_error:
            return jsonify({
                "status": "error",
                "message": ai_error
            }), 500

        # Save record in users.json
        user_record = {
            "timestamp": datetime.now().isoformat(),
            "name": name,
            "education": education,
            "skills": skills,
            "experience_level": experience_level,
            "career_goal": career_goal,
            "target_role": target_role,
            "study_hours": study_hours,
            "ai_response": ai_response
        }
        append_json_record(USERS_FILE, user_record)

        return jsonify({
            "status": "success",
            "data": ai_response
        })

    except Exception as e:
        return jsonify({
            "status": "error",
            "message": f"Server error: {str(e)}"
        }), 500

@app.route('/resume', methods=['POST'])
def resume_analyzer():
    """
    Endpoint for AI Resume Analysis.
    Expects multipart form-data with resume PDF file, target_role, experience_level.
    """
    try:
        if 'resume' not in request.files:
            return jsonify({
                "status": "error",
                "message": "No resume file uploaded. Please upload a PDF file."
            }), 400

        file = request.files['resume']
        target_role = request.form.get('target_role', '').strip()
        experience_level = request.form.get('experience_level', '').strip()

        if file.filename == '':
            return jsonify({
                "status": "error",
                "message": "No selected file. Please choose a PDF resume."
            }), 400

        if not file.filename.lower().endswith('.pdf'):
            return jsonify({
                "status": "error",
                "message": "Invalid file format. Please upload a PDF file."
            }), 400

        # Extract text from uploaded PDF using PyPDF
        pdf_text = ""
        try:
            pdf_bytes = file.read()
            reader = pypdf.PdfReader(io.BytesIO(pdf_bytes))
            for page in reader.pages:
                text = page.extract_text()
                if text:
                    pdf_text += text + "\n"
        except Exception as e:
            return jsonify({
                "status": "error",
                "message": f"Failed to extract text from PDF: {str(e)}"
            }), 400

        if not pdf_text.strip():
            return jsonify({
                "status": "error",
                "message": "Could not extract text from the PDF. The file may be empty or contain scanned image text."
            }), 400

        # Construct Resume Analyzer Prompt as specified
        prompt = f"""Act as an expert Resume Reviewer and AI Career Coach.

Analyze the following resume.

RESUME:

{pdf_text}

Target Role:

{target_role}

Experience Level:

{experience_level}

Provide:

1. Resume Profile Summary
2. Skills Identified
3. Resume Strengths
4. Resume Weak Areas
5. 5 Suitable Job Roles
6. Target Role Match Analysis
7. Missing Skills
8. Resume Improvements
9. ATS Improvement Tips
10. Learning Recommendations
11. 3 Recommended Projects
12. Job Platforms for Freshers
13. Next Career Steps

Rules:

Do not invent information.

Only analyze information found in the resume.

Give practical suggestions.

Keep the response simple and student-friendly."""

        # Call Gemini AI
        ai_response, ai_error = call_gemini_ai(prompt)

        if ai_error:
            return jsonify({
                "status": "error",
                "message": ai_error
            }), 500

        # Save record in analysis.json
        analysis_record = {
            "timestamp": datetime.now().isoformat(),
            "filename": file.filename,
            "target_role": target_role,
            "experience_level": experience_level,
            "extracted_text_length": len(pdf_text),
            "ai_response": ai_response
        }
        append_json_record(ANALYSIS_FILE, analysis_record)

        return jsonify({
            "status": "success",
            "data": ai_response
        })

    except Exception as e:
        return jsonify({
            "status": "error",
            "message": f"Server error: {str(e)}"
        }), 500

if __name__ == '__main__':
    # Run Flask development server
    port = int(os.environ.get("PORT", 5000))
    print(f"🚀 CareerAI application starting on http://127.0.0.1:{port}")
    app.run(host='0.0.0.0', port=port, debug=True)
