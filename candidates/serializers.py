from rest_framework import serializers
from .models import Candidato, CV, CVChunk, JobDescription, InterviewQuestion


class CandidatoSerializer(serializers.ModelSerializer):
    class Meta:
        model = Candidato
        fields = "__all__"
        read_only_fields = ("id", "created_at")


class CVSerializer(serializers.ModelSerializer):
    class Meta:
        model = CV
        fields = '__all__'
        read_only_fields = ("id", "created_at")


class CVChunkSerializer(serializers.ModelSerializer):
    class Meta:
        model = CVChunk
        fields = '__all__'
        read_only_fields = ("id", "created_at")


class CVUploadSerializer(serializers.Serializer):
    candidate_id = serializers.UUIDField()
    file = serializers.FileField()


class ChunkSearchSerializer(serializers.Serializer):
    query = serializers.CharField()
    cv_id = serializers.UUIDField(required=False)
    top_k = serializers.IntegerField(default=5)

class JobDescriptionSerializer(serializers.ModelSerializer):
    class Meta:
        model = JobDescription
        fields = "__all__"
        read_only_fields = ("id", "created_at", "embedding")

class CoverageSerializer(serializers.Serializer):
    cv_id = serializers.UUIDField()
    job_description_id = serializers.UUIDField()

class CoverageExplainSerializer(serializers.Serializer):
    cv_id = serializers.UUIDField()
    job_description_id = serializers.UUIDField()
    top_k = serializers.IntegerField(default=5, min_value=1, max_value=20)

class InterviewQuestionSerializer(serializers.ModelSerializer):
    class Meta:
        model = InterviewQuestion
        fields = "__all__"
        read_only_fields = ("id", "created_at", "embedding")

class LiveSuggestSerializer(serializers.Serializer):
    cv_id = serializers.UUIDField()
    job_description_id = serializers.UUIDField()
    note_text = serializers.CharField()
    top_k = serializers.IntegerField(default=3, min_value=1, max_value=10)


class StartSessionSerializer(serializers.Serializer):
    candidate_id = serializers.UUIDField()
    job_description_id = serializers.UUIDField()


class AddNoteSerializer(serializers.Serializer):
    author = serializers.CharField(required=False, allow_blank=True)
    note_text = serializers.CharField()

class NextQuestionSerializer(serializers.Serializer):
    notes_window = serializers.IntegerField(default=5, min_value=1, max_value=20)
    top_k_questions = serializers.IntegerField(default=3, min_value=1, max_value=10)
    top_k_chunks = serializers.IntegerField(default=3, min_value=1, max_value=10)

class SessionQuestionCreateSerializer(serializers.Serializer):
    question_text = serializers.CharField()
    author = serializers.CharField(required=False, allow_blank=True)

class MarkAskedSerializer(serializers.Serializer):
    asked_by = serializers.CharField(required=False, allow_blank=True)

class EndSessionSerializer(serializers.Serializer):
    ended_by = serializers.CharField(required=False, allow_blank=True)