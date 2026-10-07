"""HTML 页面路由（数据全部由前端调 API 获取；无音频也可完整阅读/打印）。"""
from flask import Blueprint, render_template, abort
from . import services as svc

views_bp = Blueprint("views", __name__)


@views_bp.get("/")
def home():
    return render_template("index.html")


@views_bp.get("/history")
def page_history():
    return render_template("content.html", page="history", title="琴史")


@views_bp.get("/schools")
def page_schools():
    return render_template("content.html", page="schools", title="流派")


@views_bp.get("/scores")
def page_scores():
    return render_template("scores.html")


@views_bp.get("/scores/<sid>")
def page_score(sid):
    if not svc.get_score(sid):
        abort(404)
    return render_template("score_detail.html", score_id=sid)


@views_bp.get("/route")
def page_route():
    return render_template("route.html")


@views_bp.get("/glossary")
def page_glossary():
    return render_template("glossary.html")


@views_bp.get("/progress")
def page_progress():
    return render_template("progress.html")


@views_bp.get("/admin")
def page_admin():
    return render_template("admin.html")


@views_bp.get("/share/<token>")
def page_share(token):
    sh = svc.get_share_link(token)
    if not sh:
        abort(404)
    return render_template("share.html", token=token)
