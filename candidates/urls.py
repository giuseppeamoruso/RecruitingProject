from django.urls import path
from rest_framework.routers import DefaultRouter
from .views import CandidatoViewSet, CVViewSet, CVChunkViewSet, CVUploadView, ChunkSearchView, JobDescriptionViewSet, \
    CoverageView, CoverageExplainView, InterviewQuestionViewSet, LiveSuggestView, StartSessionView, AddNoteView, \
    NextBestQuestionView, SessionQuestionsView, MarkQuestionAskedView, EndSessionView, SessionRecapView

router = DefaultRouter()
router.register(r'candidates', CandidatoViewSet)
router.register(r'cvs', CVViewSet)
router.register(r'chunks', CVChunkViewSet)
router.register(r'job-descriptions', JobDescriptionViewSet)
router.register(r'interview-questions', InterviewQuestionViewSet)

urlpatterns = [
    path("cvs/upload/", CVUploadView.as_view(), name="cv-upload"),
    path("search/chunks/", ChunkSearchView.as_view(), name="chunk-search"),
    path("coverage/", CoverageView.as_view(), name="coverage"),
    path("coverage/explain/", CoverageExplainView.as_view(), name="coverage-explain"),
    path("live/suggest/", LiveSuggestView.as_view(), name="live-suggest"),
    path("sessions/start/", StartSessionView.as_view()),
    path("sessions/<uuid:session_id>/notes/", AddNoteView.as_view()),
    path("sessions/<uuid:session_id>/next-question/", NextBestQuestionView.as_view(), name="next-best-question"),
    path("sessions/<uuid:session_id>/questions/", SessionQuestionsView.as_view(), name="session-questions"),
    path("interview-questions/<uuid:question_id>/mark-asked/", MarkQuestionAskedView.as_view(), name="mark-question-asked"),
    path("sessions/<uuid:session_id>/end/", EndSessionView.as_view(), name="end-session"),
    path("sessions/<uuid:session_id>/recap/", SessionRecapView.as_view(), name="session-recap"),

]

urlpatterns += router.urls
