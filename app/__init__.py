"""应用工厂。"""
import os
from flask import Flask
from .db import close_db
from .api import api_bp
from .views import views_bp

WEB_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "web")


def create_app(db_path=None):
    app = Flask(__name__,
                template_folder=os.path.join(WEB_DIR, "templates"),
                static_folder=os.path.join(WEB_DIR, "static"))
    app.config["JSON_AS_ASCII"] = False
    if db_path:
        os.environ["GUQIN_DB"] = db_path
        app.config["DATABASE"] = db_path
    app.register_blueprint(views_bp)
    app.register_blueprint(api_bp, url_prefix="/api")
    app.teardown_appcontext(close_db)
    return app
