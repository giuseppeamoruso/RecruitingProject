from django.db import models
import uuid


class Candidato(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)  # aggiungi default=uuid.uuid4
    full_name = models.TextField()
    email = models.TextField(null=True, blank=True)
    linkedin_url = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'CANDIDATI'
        managed = False
        ordering = ['-created_at']

    def __str__(self):
        return self.full_name


class CV(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    candidate = models.ForeignKey(
        Candidato,
        on_delete=models.CASCADE,
        db_column='candidate_id',
        related_name='cvs'
    )
    file_url = models.TextField()
    raw_text = models.TextField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    embedding = models.JSONField(null=True, blank=True)  # SOLO placeholder
    created_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'CVS'
        managed = False
        ordering = ['-created_at']

    def __str__(self):
        return f"CV di {self.candidate.full_name}"


class CVChunk(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    cv = models.ForeignKey(
        CV,
        on_delete=models.CASCADE,
        db_column='cv_id',
        related_name='chunks'
    )
    content = models.TextField()
    page_number = models.IntegerField(null=True, blank=True)
    chunk_index = models.IntegerField()
    embedding = models.JSONField(null=True, blank=True)  # placeholder

    class Meta:
        db_table = 'CV_CHUNKS'
        managed = False
        ordering = ['cv', 'chunk_index']

    def __str__(self):
        return f"Chunk {self.chunk_index}"

class JobDescription(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.TextField()
    description_text = models.TextField()
    embedding = models.JSONField(null=True, blank=True)  # placeholder
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'JOB_DESCRIPTIONS'
        managed = False

    def __str__(self):
        return self.title


class InterviewQuestion(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    job_description_id = models.UUIDField()  # semplice, evitiamo FK ORM con managed=False

    question_text = models.TextField()
    embedding = models.JSONField(null=True, blank=True)  # placeholder (nel DB è vector)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "INTERVIEW_QUESTIONS"
        managed = False
        ordering = ["-created_at"]

    def __str__(self):
        return self.question_text[:60]

class InterviewSession(models.Model):
    id = models.UUIDField(primary_key=True, editable=False)
    candidate_id = models.UUIDField()
    job_description_id = models.UUIDField()
    status = models.TextField(default="live")
    started_at = models.DateTimeField(null=True, blank=True)
    ended_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "INTERVIEW_SESSIONS"
        managed = False


class InterviewNote(models.Model):
    id = models.UUIDField(primary_key=True, editable=False)
    session_id = models.UUIDField()
    author = models.TextField(null=True, blank=True)
    note_text = models.TextField()
    embedding = models.JSONField(null=True, blank=True)
    created_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "INTERVIEW_NOTES"
        managed = False
