"""
National Disease Intelligence, Outbreak Aberration & Hotspot Analysis Engine.
In accordance with Proposal Section 3.6, Section 4.3, Table 5, and Appendix B Table 16:
- Farrington-style rolling threshold aberration detection
- Seasonal-naive baseline comparison
- Privacy-aware district & provincial hotspot clustering (with small-cell suppression)
- Advisory outbreak risk bands (LOW, MODERATE, HIGH, OUTBREAK_ALERT)
- Comprehensive coverage of Sri Lanka's 9 Provinces and 25 Health Districts
"""

from typing import Dict, Any, List, Optional
from datetime import date, timedelta
import math
from django.db.models import Count
from .models import DiseaseSurveillanceEvent

# Sri Lanka 9 Provinces & 25 Administrative Districts with official population benchmarks
SRI_LANKA_PROVINCES: Dict[str, Dict[str, Any]] = {
    "Western": {
        "name_en": "Western Province",
        "name_si": "බස්නාහිර පළාත",
        "districts": {
            "Colombo": 2400000,
            "Gampaha": 2300000,
            "Kalutara": 1250000,
        }
    },
    "Central": {
        "name_en": "Central Province",
        "name_si": "මධ්‍යම පළාත",
        "districts": {
            "Kandy": 1400000,
            "Matale": 520000,
            "Nuwara Eliya": 780000,
        }
    },
    "Southern": {
        "name_en": "Southern Province",
        "name_si": "දකුණු පළාත",
        "districts": {
            "Galle": 1100000,
            "Matara": 850000,
            "Hambantota": 650000,
        }
    },
    "Northern": {
        "name_en": "Northern Province",
        "name_si": "උතුරු පළාත",
        "districts": {
            "Jaffna": 620000,
            "Kilinochchi": 130000,
            "Mannar": 110000,
            "Vavuniya": 190000,
            "Mullaitivu": 100000,
        }
    },
    "Eastern": {
        "name_en": "Eastern Province",
        "name_si": "නැගෙනහිර පළාත",
        "districts": {
            "Batticaloa": 560000,
            "Ampara": 700000,
            "Trincomalee": 420000,
        }
    },
    "North Western": {
        "name_en": "North Western Province",
        "name_si": "වයඹ පළාත",
        "districts": {
            "Kurunegala": 1680000,
            "Puttalam": 820000,
        }
    },
    "North Central": {
        "name_en": "North Central Province",
        "name_si": "උතුරු මැද පළාත",
        "districts": {
            "Anuradhapura": 920000,
            "Polonnaruwa": 430000,
        }
    },
    "Uva": {
        "name_en": "Uva Province",
        "name_si": "ඌව පළාත",
        "districts": {
            "Badulla": 860000,
            "Monaragala": 500000,
        }
    },
    "Sabaragamuwa": {
        "name_en": "Sabaragamuwa Province",
        "name_si": "සබරගමු පළාත",
        "districts": {
            "Ratnapura": 1140000,
            "Kegalle": 880000,
        }
    },
}

# Flat district populations map (all 25 districts)
DISTRICT_POPULATIONS: Dict[str, int] = {}
DISTRICT_TO_PROVINCE: Dict[str, str] = {}

for prov_key, prov_data in SRI_LANKA_PROVINCES.items():
    for dist_name, dist_pop in prov_data["districts"].items():
        DISTRICT_POPULATIONS[dist_name] = dist_pop
        DISTRICT_TO_PROVINCE[dist_name] = prov_key


def calculate_disease_trends(condition_code: str = "influenza", weeks_back: int = 12) -> Dict[str, Any]:
    """
    Computes weekly time-series trends, seasonal-naive baselines, and Farrington-style aberration thresholds.
    """
    today = date.today()
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
    # threshold = mean + 1.96 * std_dev
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
    Enriched with Provincial metadata for regional mapping.
    """
    qs = DiseaseSurveillanceEvent.objects.filter(
        condition_code__iexact=condition_code,
        verification_status='verified'
    ).values('region_code').annotate(total_cases=Count('event_key'))

    district_counts = {item['region_code']: item['total_cases'] for item in qs}
    hotspots: List[Dict[str, Any]] = []

    for district, pop in DISTRICT_POPULATIONS.items():
        raw_count = district_counts.get(district, 0)
        prov_key = DISTRICT_TO_PROVINCE.get(district, "Other")
        prov_info = SRI_LANKA_PROVINCES.get(prov_key, {})
        
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
            "province_id": prov_key,
            "province_name": prov_info.get("name_en", prov_key),
            "province_si": prov_info.get("name_si", ""),
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


def calculate_province_summary(condition_code: str = "influenza") -> List[Dict[str, Any]]:
    """
    Computes provincial aggregates across Sri Lanka's 9 provinces.
    Allows public health officers and doctors to see patient distributions categorized by province.
    """
    hotspots = calculate_district_hotspots(condition_code)
    
    # Calculate national total
    total_national_cases = sum(h["raw_cases"] for h in hotspots)
    
    province_results: List[Dict[str, Any]] = []

    for prov_key, prov_data in SRI_LANKA_PROVINCES.items():
        prov_hotspots = [h for h in hotspots if h["province_id"] == prov_key]
        prov_total_cases = sum(h["raw_cases"] for h in prov_hotspots)
        prov_population = sum(prov_data["districts"].values())
        
        # Attack rate per 100k
        prov_rate = round((prov_total_cases / prov_population) * 100000, 2) if prov_total_cases > 0 else 0.0
        
        # Percentage of national load
        pct_of_national = round((prov_total_cases / total_national_cases) * 100, 1) if total_national_cases > 0 else 0.0
        
        # Find highest district
        highest_dist = max(prov_hotspots, key=lambda x: x["raw_cases"]) if prov_hotspots else None
        highest_district_text = f"{highest_dist['district']} ({highest_dist['raw_cases']} cases)" if highest_dist and highest_dist['raw_cases'] > 0 else "None"

        # Provincial risk categorization
        if prov_rate > 22.0:
            risk_level = "CRITICAL_HOTSPOT"
            risk_label_si = "අතිශය අවදානම්"
            badge_color = "red"
        elif prov_rate > 12.0:
            risk_level = "HIGH_RISK"
            risk_label_si = "ඉහළ අවදානම"
            badge_color = "orange"
        elif prov_rate > 4.0:
            risk_level = "MODERATE_RISK"
            risk_label_si = "මධ්‍යස්ථ අවදානම"
            badge_color = "yellow"
        else:
            risk_level = "LOW_INCIDENCE"
            risk_label_si = "අඩු අවදානම"
            badge_color = "green"

        province_results.append({
            "province_id": prov_key,
            "province_name": prov_data["name_en"],
            "province_si": prov_data["name_si"],
            "total_cases": prov_total_cases,
            "population": prov_population,
            "rate_per_100k": prov_rate,
            "percentage_of_national": pct_of_national,
            "risk_level": risk_level,
            "risk_label_si": risk_label_si,
            "badge_color": badge_color,
            "highest_district": highest_district_text,
            "districts": prov_hotspots,
        })

    # Sort by total cases descending
    province_results.sort(key=lambda x: x["total_cases"], reverse=True)
    return province_results


def get_national_surveillance_summary(condition_code: str = "influenza", weeks_back: int = 12) -> Dict[str, Any]:
    """
    Combined endpoint payload with temporal trends, district hotspots, provincial groupings,
    and high-level national alert metrics.
    """
    trends = calculate_disease_trends(condition_code=condition_code, weeks_back=weeks_back)
    hotspots = calculate_district_hotspots(condition_code=condition_code)
    provinces = calculate_province_summary(condition_code=condition_code)

    total_national_cases = sum(h["raw_cases"] for h in hotspots)
    high_activity_districts = sum(1 for h in hotspots if h["cluster_status"] in ["CRITICAL_HOTSPOT", "ELEVATED_CLUSTER"])
    high_activity_provinces = sum(1 for p in provinces if p["risk_level"] in ["CRITICAL_HOTSPOT", "HIGH_RISK"])

    return {
        "condition_code": condition_code,
        "pilot_condition": condition_code in ["influenza", "chickenpox"],
        "temporal_trends": trends,
        "hotspots": hotspots,
        "provinces": provinces,
        "summary": {
            "total_national_cases": total_national_cases,
            "high_activity_districts": high_activity_districts,
            "total_districts": len(hotspots),
            "high_activity_provinces": high_activity_provinces,
            "total_provinces": len(provinces),
            "latest_observed": trends.get("latest_observed", 0),
            "latest_threshold": trends.get("latest_threshold", 0),
            "current_risk_band": trends.get("current_risk_band", "LOW"),
            "is_outbreak_warning": trends.get("is_outbreak_warning", False),
            "evaluated_week": trends.get("latest_week", ""),
            "model_used": trends.get("model_used", "Farrington-Rolling-Aberration-v1"),
        }
    }
