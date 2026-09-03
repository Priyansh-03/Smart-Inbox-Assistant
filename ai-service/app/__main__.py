"""Entry point: `python -m app`. Host/port from env or --host/--port CLI flags."""
import argparse
import logging

import uvicorn

from .config import config

logging.basicConfig(level=logging.INFO,
                    format="%(asctime)s %(levelname)s %(name)s %(message)s")

if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--host", default=config.HOST)
    p.add_argument("--port", type=int, default=config.PORT)
    args = p.parse_args()
    logging.getLogger("ai-service").info("Starting AI service on %s:%d", args.host, args.port)
    uvicorn.run("app.main:app", host=args.host, port=args.port)
