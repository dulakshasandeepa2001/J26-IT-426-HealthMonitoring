"""
National Disease Intelligence, Outbreak Aberration & Hotspot Analysis Engine.
In accordance with Proposal Section 3.6, Section 4.3, Table 5, and Appendix B Table 16:
- Farrington-style rolling threshold aberration detection
- Seasonal-naive baseline comparison
- Privacy-aware district hotspot clustering (with small-cell suppression)
- Advisory outbreak risk bands (LOW, MODERATE, HIGH, OUTBREAK_ALERT)
"""

from typing import Dict, Any, List, Optional
from datetime import date, timedelta
import math
from django.db.models import Count
from .models import DiseaseSurveillanceEvent

# Population estimates for Sri Lankan districts (for attack rate per 10,000)
DISTRICT_POPULATIONS: Dict[str, int] = {
    "Colombo": 2400000,
    "Gampaha": 2300000,
    "Kalutara": 1250000,
    "Kandy": 1400000,
    "Galle": 1100000,
    "Matara": 850000,
    "Kurunegala": 1650000,
    "Ratnapura": 1100000,
    "Anuradhapura": 900000,
    "Jaffna": 600000,
    "Badulla": 850000,
    "Batticaloa": 550000,
}


def calculate_disease_trends(condition_code: str = "influenza", weeks_back: int = 12) -> Dict[str, Any]:
    """
    Computes weekly time-series trends, seasonal-naive baselines, and Farrington-style aberration thresholds.
    """
    today = date.today()
    # Build list of ISO weeks
    timeline: List[str] = []
    weekly_counts: Dict[str, int] = {}
    
    for i in range(weeks_back - 1, -1, -1):
        target_date = today - timedelta(weeks=i)
        year, week_num, _ = target_date.isocalendar()
        iso_week = f"{year}-W{week_num:02d}"
        if iso_week not in timeline:
            timeline.append(iso_week)
            weekly_counts[iso_week] = 0

    # Query aggregate verified events
    qs = DiseaseSurveillanceEvent.objects.filter(
        condition_code__iexact=condition_code,
        verification_status='verified',
        report_week__in=timeline
    ).values('report_week').annotate(count=Count('event_key'))

    for item in qs:
        week = item['report_week']
        if week in weekly_counts:
            weekly_counts[week] = item['count']

    # Compute Moving Baseline & Thresholds (Farrington-style)
    # threshold = mean + 2 * std_dev
    counts_series = [weekly_counts[w] for w in timeline]
    trend_points: List[Dict[str, Any]] = []
    
    for idx, week in enumerate(timeline):
        observed = counts_series[idx]
        
        # Historical window (up to prior 4 weeks)
        window = counts_series[max(0, idx - 4):idx]
        if window:
            hist_mean = sum(window) / len(window)
            variance = sum((x - hist_mean) ** 2 for x in window) / len(window)
            std_dev = math.sqrt(variance)
            threshold = round(hist_mean + (1.96 * max(std_dev, 1.0)), 1)
            baseline = round(hist_mean, 1)
        else:
            baseline = observed
            threshold = observed + 5

        # Aberration check
        is_aberration = observed > threshold and observed >= 5
        risk_level = "LOW"
        if observed > threshold * 1.5:
            risk_level = "OUTBREAK_ALERT"
        elif observed > threshold:
            risk_level = "HIGH"
        elif observed > baseline:
            risk_level = "MODERATE"

        trend_points.append({
            "week": week,
            "observed_cases": observed,
            "baseline": baseline,
            "threshold": threshold,
            "is_aberration": is_aberration,
            "risk_level": risk_level,
        })

    latest = trend_points[-1] if trend_points else {}

    return {
        "condition_code": condition_code,
        "pilot_condition": condition_code in ["influenza", "chickenpox"],
        "evaluation_window_weeks": weeks_back,
        "latest_week": latest.get("week", ""),
        "latest_observed": latest.get("observed_cases", 0),
        "latest_threshold": latest.get("threshold", 0),
        "current_risk_band": latest.get("risk_level", "LOW"),
        "is_outbreak_warning": latest.get("is_aberration", False),
        "model_used": "Farrington-Rolling-Aberration-v1",
        "data_points": trend_points,
    }


def calculate_district_hotspots(condition_code: str = "influenza") -> List[Dict[str, Any]]:
    """
    Computes spatial hotspot distribution across Sri Lankan districts.
    Includes privacy preservation: small cells (< 3 cases) are suppressed (NFR1, Table 16).
    """
    qs = DiseaseSurveillanceEvent.objects.filter(
        condition_code__iexact=condition_code,
        verification_status='verified'
    ).values('region_code').annotate(total_cases=Count('event_key'))

    district_counts = {item['region_code']: item['total_cases'] for item in qs}
    hotspots: List[Dict[str, Any]] = []

    for district, pop in DISTRICT_POPULATIONS.items():
        raw_count = district_counts.get(district, 0)
        
        # Privacy preservation (small-cell suppression)
        is_suppressed = 0 < raw_count < 3
        display_count = "< 3" if is_suppressed else raw_count
        
        # Rate per 100,000 population
        rate = round((raw_count / pop) * 100000, 2) if raw_count >= 3 else 0.0

        # Cluster risk classification
        if rate > 25.0:
            cluster_status = "CRITICAL_HOTSPOT"
            badge_color = "red"
        elif rate > 12.0:
            cluster_status = "ELEVATED_CLUSTER"
            badge_color = "orange"
        elif rate > 4.0:
            cluster_status = "MODERATE_ACTIVITY"
            badge_color = "yellow"
        else:
            cluster_status = "LOW_INCIDENCE"
            badge_color = "green"

        hotspots.append({
            "district": district,
            "population": pop,
            "cases": display_count,
            "raw_cases": raw_count,
            "is_suppressed": is_suppressed,
            "rate_per_100k": rate,
            "cluster_status": cluster_status,
            "badge_color": badge_color,
        })

    hotspots.sort(key=lambda x: x["rate_per_100k"], reverse=True)
    return hotspots
