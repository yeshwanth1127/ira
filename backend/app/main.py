import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import activity, auth, boq, design, documents, erp, integrations, projects, qs, users, webhooks
from app.core.config import resolved_n8n_boq_callback_url

logger = logging.getLogger("uvicorn.error")


@asynccontextmanager
async def lifespan(_: FastAPI):
    u = resolved_n8n_boq_callback_url()
    if not u:
        logger.warning(
            "N8N_BOQ_CALLBACK_URL and PUBLIC_APP_URL are unset — hosted n8n cannot reach this API. "
            "Set N8N_BOQ_CALLBACK_URL=https://<your-public-host>/api/approval on this server."
        )
    elif "127.0.0.1" in u or "localhost" in u.lower():
        logger.warning(
            "BOQ callback URL is local (%s). Cloud n8n must use your public API URL; set N8N_BOQ_CALLBACK_URL accordingly.",
            u,
        )
    yield


app = FastAPI(title="Alufit BOQ Workflow API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(projects.router)
app.include_router(boq.router)
app.include_router(documents.router)
app.include_router(design.router)
app.include_router(qs.router)
app.include_router(erp.router)
app.include_router(activity.router)
app.include_router(users.router)
app.include_router(integrations.router)
app.include_router(webhooks.router)
app.include_router(webhooks.approval_router)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}
