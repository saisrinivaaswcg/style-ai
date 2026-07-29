from fastapi import FastAPI

app = FastAPI()


@app.get("/")
def home():
    return {
        "message": "Virtual Closet API is running!"
    }