"""开发入口：python run.py [--reseed] [--port 8000]"""
import argparse
from app import create_app
from app.db import DB_PATH
import os
import seed

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--reseed", action="store_true")
    ap.add_argument("--port", type=int, default=8000)
    ap.add_argument("--host", default="127.0.0.1")
    args = ap.parse_args()
    if args.reseed or not os.path.exists(DB_PATH):
        info = seed.run()
        print("已初始化数据库:", info)
    app = create_app()
    app.run(host=args.host, port=args.port, debug=False)
