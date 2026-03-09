import google.generativeai as genai
import os

genai.configure(api_key=os.getenv("GEMINI_API_KEY"))

# Add system instruction here – it will apply to all conversations
model = genai.GenerativeModel(
    "gemini-2.5-flash",
    system_instruction=(
        "You are a professional fashion assistant. "
        "Never use emojis. Always respond in a clear, step‑by‑step format "
        "with numbered steps. Be concise and factual."
    )
)

def fashion_chat(prompt):
    response = model.generate_content(prompt)
    return response.text

def analyze_fashion_image(image_path, prompt=""):
    """Analyze a fashion image using Gemini vision capabilities"""
    try:
        image_file = genai.upload_file(image_path)
        analysis_prompt = f"""You are a professional fashion expert and stylist. Analyze this fashion image and provide:

1. **What's in the image**: Brief description of the items/outfit
2. **Style Assessment**: The overall style, colors, and composition
3. **Fashion Tips**: How to style it better, complementary items that would work
4. **Occasion**: What occasions this outfit is suitable for
5. **Improvements**: Suggestions to elevate the look

User prompt: {prompt if prompt else 'Give me a comprehensive fashion analysis.'}

Keep the response concise but informative. Do NOT use emojis. Use numbered steps."""
        
        response = model.generate_content([analysis_prompt, image_file])
        try:
            genai.delete_file(image_file.name)
        except:
            pass
        return response.text
    except Exception as e:
        print(f"Image Analysis Error: {str(e)}")
        return f"Unable to analyze the image: {str(e)}"