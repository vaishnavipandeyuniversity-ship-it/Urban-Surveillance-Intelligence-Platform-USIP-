/*
 * threat_scorer.c
 * High-performance threat scoring engine
 * Urban Surveillance Intelligence Platform
 * Compile: gcc -shared -fPIC -o threat_scorer.so threat_scorer.c -lm
 */

#include <stdio.h>
#include <stdlib.h>
#include <math.h>
#include <string.h>
#include <time.h>

#define MAX_EVENTS 1000
#define SEVERITY_NONE     0
#define SEVERITY_LOW      1
#define SEVERITY_MEDIUM   2
#define SEVERITY_HIGH     3
#define SEVERITY_CRITICAL 4

typedef struct {
    char event_id[32];
    double confidence;
    int severity;
    double lat;
    double lng;
    long timestamp;
} ThreatEvent;

typedef struct {
    double score;           // 0.0 - 1.0
    int severity_level;     // 0-4
    double cluster_density; // nearby threats/km²
    int escalation_flag;    // 1 if score rising fast
} ThreatScore;

/* Haversine distance in meters */
double haversine(double lat1, double lng1, double lat2, double lng2) {
    const double R = 6371000.0;
    double dlat = (lat2 - lat1) * M_PI / 180.0;
    double dlng = (lng2 - lng1) * M_PI / 180.0;
    double a = sin(dlat/2) * sin(dlat/2)
             + cos(lat1 * M_PI/180.0) * cos(lat2 * M_PI/180.0)
             * sin(dlng/2) * sin(dlng/2);
    double c = 2.0 * atan2(sqrt(a), sqrt(1.0-a));
    return R * c;
}

/* Compute threat score from a set of recent events */
ThreatScore compute_threat_score(ThreatEvent* events, int count,
                                  double focal_lat, double focal_lng,
                                  double radius_m) {
    ThreatScore result = {0.0, 0, 0.0, 0};
    if (count == 0) return result;

    double weighted_sum = 0.0;
    double weight_total = 0.0;
    int nearby_count = 0;
    int max_severity = 0;
    double prev_score = 0.0;

    long now = (long)time(NULL);

    for (int i = 0; i < count && i < MAX_EVENTS; i++) {
        double dist = haversine(focal_lat, focal_lng,
                                events[i].lat, events[i].lng);
        if (dist > radius_m) continue;

        nearby_count++;

        /* Time decay: events older than 5 min have less weight */
        double age_sec = (double)(now - events[i].timestamp);
        double time_weight = exp(-age_sec / 300.0);

        /* Distance decay */
        double dist_weight = 1.0 - (dist / radius_m);

        /* Severity multiplier */
        double sev_mult = (double)(events[i].severity + 1) / 5.0;

        double w = time_weight * dist_weight * sev_mult * events[i].confidence;
        weighted_sum += w;
        weight_total += 1.0;

        if (events[i].severity > max_severity) {
            max_severity = events[i].severity;
        }
    }

    if (weight_total > 0) {
        result.score = fmin(weighted_sum / weight_total * 5.0, 1.0);
    }

    result.severity_level = max_severity;
    result.cluster_density = nearby_count > 0
        ? (double)nearby_count / (M_PI * radius_m * radius_m / 1e6)
        : 0.0;

    /* Escalation: score well above previous or > 0.7 with critical events */
    if (result.score > prev_score * 1.3 || (result.score > 0.7 && max_severity >= SEVERITY_CRITICAL)) {
        result.escalation_flag = 1;
    }

    return result;
}

/* Zone risk aggregator */
double zone_risk_score(int* severities, double* confidences, int n) {
    if (n == 0) return 0.0;
    double total = 0.0;
    for (int i = 0; i < n; i++) {
        total += (double)severities[i] * confidences[i];
    }
    /* Normalize: max possible is 4.0 per event */
    double normalized = total / ((double)n * 4.0);
    return fmin(normalized, 1.0);
}

/* Anomaly score: deviation from baseline frequency */
double anomaly_score(int current_events_per_min, double baseline_per_min) {
    if (baseline_per_min <= 0.0) return 0.0;
    double ratio = (double)current_events_per_min / baseline_per_min;
    /* Sigmoid-like mapping */
    double x = ratio - 1.0;
    return 1.0 / (1.0 + exp(-3.0 * x));
}

/* Print a score report */
void print_score_report(ThreatScore* s, const char* zone_name) {
    const char* labels[] = {"NONE", "LOW", "MEDIUM", "HIGH", "CRITICAL"};
    printf("╔══════════════════════════════════════╗\n");
    printf("║  THREAT SCORE REPORT: %-14s║\n", zone_name);
    printf("╠══════════════════════════════════════╣\n");
    printf("║  Score:         %.3f                 ║\n", s->score);
    printf("║  Severity:      %-8s              ║\n", labels[s->severity_level]);
    printf("║  Cluster Dens:  %.2f /km²            ║\n", s->cluster_density);
    printf("║  Escalation:    %-3s                  ║\n", s->escalation_flag ? "YES" : "NO");
    printf("╚══════════════════════════════════════╝\n");
}

/* Demo / test main */
int main() {
    printf("Urban Surveillance Threat Scorer v1.0\n\n");

    /* Simulate some events */
    ThreatEvent events[10];
    long now = (long)time(NULL);

    double base_lat = 29.8656, base_lng = 77.8958;

    for (int i = 0; i < 10; i++) {
        snprintf(events[i].event_id, 32, "EVT-%04d", i);
        events[i].lat = base_lat + (double)(rand() % 100 - 50) / 10000.0;
        events[i].lng = base_lng + (double)(rand() % 100 - 50) / 10000.0;
        events[i].severity = rand() % 5;
        events[i].confidence = 0.7 + (double)(rand() % 30) / 100.0;
        events[i].timestamp = now - (rand() % 300);
    }

    /* Force one critical */
    events[3].severity = SEVERITY_CRITICAL;
    events[3].confidence = 0.95;
    events[3].lat = base_lat;
    events[3].lng = base_lng;
    events[3].timestamp = now - 10;

    ThreatScore score = compute_threat_score(events, 10, base_lat, base_lng, 500.0);
    print_score_report(&score, "NORTH GATE");

    /* Test anomaly score */
    double anomaly = anomaly_score(12, 4.0);
    printf("\nAnomaly Score (12 events vs baseline 4): %.3f\n", anomaly);

    /* Test zone risk */
    int sevs[] = {2, 3, 4, 1, 3};
    double confs[] = {0.8, 0.9, 0.95, 0.7, 0.85};
    double zrisk = zone_risk_score(sevs, confs, 5);
    printf("Zone Risk Score (5 events): %.3f\n", zrisk);

    return 0;
}
