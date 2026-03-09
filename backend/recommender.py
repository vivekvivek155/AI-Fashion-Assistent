import pandas as pd
import os
import numpy as np

BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
CSV_PATH = os.path.join(BACKEND_DIR, "products.csv")

print(f"Loading dataset from {CSV_PATH}")
df = pd.read_csv(CSV_PATH)

# Normalize column names to lowercase
df.columns = df.columns.str.strip().str.lower()

# Ensure required columns exist
required = ["gender", "category", "subcategory", "size", "brand", "min_price", "max_price", "rating"]
for col in required:
    if col not in df.columns:
        raise ValueError(f"Missing required column: {col}")

# Compute a representative price (midpoint) for scoring purposes
df["mid_price"] = (df["min_price"] + df["max_price"]) / 2
global_max_midprice = df["mid_price"].max()

_last_mtime = os.path.getmtime(CSV_PATH)

def _ensure_data():
    """Reload the CSV if it has been modified on disk."""
    global df, _last_mtime, global_max_midprice
    try:
        mtime = os.path.getmtime(CSV_PATH)
    except OSError:
        return
    if mtime > _last_mtime:
        print(f"Detected change in {CSV_PATH}, reloading")
        df = pd.read_csv(CSV_PATH)
        df.columns = df.columns.str.strip().str.lower()
        df["mid_price"] = (df["min_price"] + df["max_price"]) / 2
        global_max_midprice = df["mid_price"].max()
        _last_mtime = mtime

def recommend_products(filters):
    """Return top 5 products based on rating and price score."""
    _ensure_data()
    data = df.copy()
    data = _apply_filters(data, filters)
    if len(data) == 0:
        return []
    
    data["score"] = (
        data["rating"].fillna(0) * 0.5 +
        (100 - (data["mid_price"].fillna(0) / global_max_midprice * 100)) * 0.3 + 20  
    )
    results = data.sort_values(by="score", ascending=False).head(5)
    results = results.drop(columns=["mid_price"], errors="ignore")
    
    # CRITICAL FIX: Convert empty values (NaN) to empty strings so FastAPI JSON doesn't crash
    results = results.fillna("")
    return results.to_dict(orient="records")

def search_products(filters):
    """Return all matching products with a score field (same as recommend)."""
    _ensure_data()
    data = df.copy()
    data = _apply_filters(data, filters)
    if len(data) == 0:
        return []
        
    data["score"] = (
        data["rating"].fillna(0) * 0.5 +
        (100 - (data["mid_price"].fillna(0) / global_max_midprice * 100)) * 0.3 + 20
    )
    results = data.drop(columns=["mid_price"], errors="ignore")
    
    # CRITICAL FIX: Convert empty values (NaN) to empty strings so FastAPI JSON doesn't crash
    results = results.fillna("")
    return results.to_dict(orient="records")

def _apply_filters(data, filters):
    """Apply filters safely avoiding NaN crashes"""
    if filters.get("gender"):
        data = data[data["gender"].fillna("").astype(str).str.lower() == filters["gender"].lower()]

    if filters.get("category"):
        cat_val = filters["category"].lower()
        data = data[
            (data["category"].fillna("").astype(str).str.lower() == cat_val) |
            (data["subcategory"].fillna("").astype(str).str.lower() == cat_val)
        ]
    
    if filters.get("subcategory"):
        data = data[data["subcategory"].fillna("").astype(str).str.lower() == filters["subcategory"].lower()]

    if filters.get("brand"):
        data = data[data["brand"].fillna("").astype(str).str.lower() == filters["brand"].lower()]

    if filters.get("size"):
        data = data[data["size"].fillna("").astype(str).str.upper() == filters["size"].upper()]

    # Price range
    user_min = filters.get("min_price")
    user_max = filters.get("max_price")
    if user_min is not None or user_max is not None:
        try:
            user_min = float(user_min) if user_min is not None else 0
            user_max = float(user_max) if user_max is not None else float('inf')
            data = data[(data["min_price"].fillna(0) <= user_max) & (data["max_price"].fillna(float('inf')) >= user_min)]
        except:
            pass

    # Minimum rating
    if filters.get("min_rating"):
        try:
            min_rating = float(filters["min_rating"])
            data = data[data["rating"].fillna(0) >= min_rating]
        except:
            pass

    return data