from rest_framework.routers import DefaultRouter
from .views import MedicineEntryViewSet

router = DefaultRouter()
router.register('medicines', MedicineEntryViewSet, basename='medicine-knowledge')
urlpatterns = router.urls
