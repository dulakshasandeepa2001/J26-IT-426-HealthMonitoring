from django.urls import path
from .views import ProposalListView, ProposalDecisionView, PrescriptionSlipView, DecisionHistoryView

urlpatterns = [
    path('consultations/<uuid:consultation_id>/medicine-proposals/', ProposalListView.as_view()),
    path('medicine-proposals/<uuid:proposal_id>/decisions/', ProposalDecisionView.as_view()),
    path('prescription-slips/<uuid:decision_id>/', PrescriptionSlipView.as_view()),
    path('doctor-decisions/', DecisionHistoryView.as_view()),
]
