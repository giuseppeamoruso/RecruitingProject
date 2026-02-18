from django.contrib import admin
from .models import Candidato, CV, CVChunk


@admin.register(Candidato)
class CandidatoAdmin(admin.ModelAdmin):
    list_display = ('full_name', 'email', 'created_at')
    search_fields = ('full_name', 'email')
    ordering = ('-created_at',)


@admin.register(CV)
class CVAdmin(admin.ModelAdmin):
    list_display = ('candidate', 'is_active', 'created_at')
    list_filter = ('is_active',)
    ordering = ('-created_at',)


@admin.register(CVChunk)
class CVChunkAdmin(admin.ModelAdmin):
    list_display = ('cv', 'chunk_index', 'page_number')
    ordering = ('cv', 'chunk_index')
