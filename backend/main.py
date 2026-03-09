from dotenv import load_dotenv
load_dotenv()  # Load BEFORE other imports

from fastapi import FastAPI, UploadFile, File
from recommender import recommend_products, search_products
from gemini_service import fashion_chat, analyze_fashion_image
from fastapi.middleware.cors import CORSMiddleware
import os
import tempfile
import re

app = FastAPI()

# Allow frontend to connect
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # allow all origins for dev
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def home():
    return {"message": "Fashion AI API running"}

# Recommendation API
@app.post("/recommend")
def recommend(data: dict):
    try:
        results = recommend_products(data)
        return {"recommendations": results}
    except Exception as e:
        print(f"Recommend API Error: {str(e)}")
        return {"recommendations": [], "error": str(e)}

# Provide unique filter values directly from CSV
# Provide unique filter values directly from CSV
@app.get("/filters")
def get_filters():
    try:
        from recommender import df
        
        # Helper function to safely get sorted unique values
        def get_unique(col):
            return sorted(df[col].dropna().unique().tolist()) if col in df.columns else []

        # Create gender-specific subcategory mappings
        sub_map = {"male": [], "female": [], "unisex": []}
        if "gender" in df.columns and "subcategory" in df.columns:
            for g in ["male", "female", "unisex"]:
                subs = df[df["gender"].str.lower() == g]["subcategory"].dropna().unique().tolist()
                sub_map[g] = sorted(subs)

        return {
            "gender": get_unique("gender"),
            "category": get_unique("category"),
            "subcategory": get_unique("subcategory"),
            "size": get_unique("size"),
            "brand": get_unique("brand"),
            "subcategory_map": sub_map  # Send the mapping to the frontend
        }
    except Exception as e:
        print(f"Filters API Error: {str(e)}")
        return {"error": str(e)}
@app.post("/get-tips")
def get_tips(data: dict):
    """
    Generate pro tips and disadvantages for a product using Gemini AI
    """
    try:
        product_name = data.get("product_name", "")
        product_details = data.get("details", "")
        event_type = data.get("event_type", "")
        
        prompt = f"""You are a professional fashion stylist. For this product: {product_name} ({product_details}) designed for {event_type} occasions.

Provide exactly two things:
1. One specific styling tip (max 50 words)
2. One realistic limitation or care requirement (max 50 words)

Format your response as:
TIP: [your styling tip here]
LIMITATION: [your limitation here]

Be specific and helpful."""
        
        ai_reply = fashion_chat(prompt)
        
        # Extract tip and limitation from response
        tip = ""
        limitation = ""
        
        # Look for TIP: and LIMITATION: markers
        tip_match = re.search(r'TIP:\s*(.+?)(?=LIMITATION:|$)', ai_reply, re.IGNORECASE | re.DOTALL)
        if tip_match:
            tip = tip_match.group(1).strip()
        
        limitation_match = re.search(r'LIMITATION:\s*(.+?)$', ai_reply, re.IGNORECASE | re.DOTALL)
        if limitation_match:
            limitation = limitation_match.group(1).strip()
        
        # If parsing failed, use the whole response as tip
        if not tip and not limitation:
            # Split by common separators
            parts = re.split(r'[.\n]', ai_reply.strip(), 1)
            tip = parts[0].strip() if parts else ai_reply.strip()
            limitation = parts[1].strip() if len(parts) > 1 else "Requires proper care and maintenance."
        
        # Ensure we have content
        if not tip:
            tip = f"Style this {product_name.lower()} with complementary pieces for {event_type} occasions."
        if not limitation:
            limitation = "Check care instructions to maintain quality and appearance."
        
        return {
            "pro_tip": tip,
            "disadvantage": limitation
        }
    except Exception as e:
        print(f"Tips API Error: {str(e)}")
        # Even on error, try to provide some Gemini-generated content
        return {
            "pro_tip": "Consult a fashion expert for personalized styling advice.",
            "disadvantage": "Professional care recommended for optimal longevity."
        }

@app.post("/chat")
def chat(data: dict):
    try:
        user_message = data.get("message", "")
        if not user_message:
            return {"reply": "Please provide a message"}
        
        # Strong, explicit instruction
        instruction = (
    "You are a professional fashion assistant. Follow these rules:\n"
    "- NEVER use emojis.\n"
    "- ALWAYS structure your answer in numbered steps (1., 2., 3., ...).\n"
    "- Keep each step concise and factual.\n"
    "- Do NOT use any markdown formatting like **bold** or *italics*. Use plain text only.\n"
    "- Maintain a formal, helpful tone.\n\n"
    "Now answer the following:\n"
)
        full_prompt = instruction + "\n\n" + user_message
        ai_reply = fashion_chat(full_prompt)
        return {"reply": ai_reply}
    except Exception as e:
        print(f"Chat API Error: {str(e)}")
        return {"reply": f"Error: {str(e)}"}

@app.post("/analyze-image")
async def analyze_image(file: UploadFile = File(...), prompt: str = ""):
    """
    Analyze a fashion image using Gemini AI vision
    """
    try:
        # Create a temporary file to save the uploaded image
        with tempfile.NamedTemporaryFile(delete=False, suffix=".jpg") as tmp_file:
            contents = await file.read()
            tmp_file.write(contents)
            tmp_file_path = tmp_file.name
        
        try:
            # Analyze the image
            analysis = analyze_fashion_image(tmp_file_path, prompt)
            return {"analysis": analysis}
        finally:
            # Clean up temporary file
            if os.path.exists(tmp_file_path):
                os.remove(tmp_file_path)
    
    except Exception as e:
        print(f"Image Analysis API Error: {str(e)}")
        return {"analysis": f"Error analyzing image: {str(e)}"}

@app.post("/search-products")
def search_products_endpoint(filters: dict):
    """
    Search and filter products from CSV based on user criteria.
    Handles dynamic filtering for category, price, rating, size, gender, color, brand, event_type.
    Optimized for datasets up to 10,000 rows.
    """
    try:
        # Use search function for filtering
        results = search_products(filters)
        
        # Return structured JSON response
        return {
            "success": True,
            "count": len(results),
            "products": results,
            "filters_applied": {k: v for k, v in filters.items() if v is not None and v != ""}
        }
    except Exception as e:
        print(f"Search Products API Error: {str(e)}")
        return {
            "success": False,
            "error": str(e),
            "count": 0,
            "products": []
        }