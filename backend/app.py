from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import uvicorn
from capture import tag_clothing
from inventory import load_closet, save_item
import uuid
import os

app = FastAPI()

# Allow React frontend to talk to this backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve uploaded images
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

# ─── Routes ───────────────────────────────────────

@app.get("/")
def home():
    return {"message": "Virtual Closet API is running!"}

@app.get("/inventory")
def get_inventory():
    return load_closet()

@app.post("/upload")
async def upload_clothing(file: UploadFile = File(...)):
    # Save uploaded photo
    ext = file.filename.split(".")[-1]
    filename = f"{uuid.uuid4()}.{ext}"
    filepath = f"uploads/{filename}"
    with open(filepath, "wb") as f:
        f.write(await file.read())

    # Tag the clothing using GPT-4o Vision
    tags = await tag_clothing(filepath)

    # Save to inventory
    item = save_item(tags, filepath)

    return {"message": "Item added!", "item": item}

if __name__ == "__main__":
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)