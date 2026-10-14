from rest_framework.routers import DefaultRouter
from .views import SafetyProfileViewSet, PrescriptionDraftViewSet

router = DefaultRouter()
router.register('safety-profiles', SafetyProfileViewSet, basename='safety-profile')
router.register('drafts', PrescriptionDraftViewSet, basename='prescription-draft')
urlpatterns = router.urls
