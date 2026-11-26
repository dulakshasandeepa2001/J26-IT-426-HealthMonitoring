import cv2
import numpy as np
import matplotlib.pyplot as plt
from scipy.signal import butter, filtfilt, find_peaks

vpath = r"C:/Users/Asus/.gemini/antigravity/brain/ad3976f8-b7aa-4d8b-924d-0ec5f04fcd2e/.user_uploaded/media_1795534154742_9641676b.mp4"
cap = cv2.VideoCapture(vpath)
fps = cap.get(cv2.CAP_PROP_FPS)

red_values = []
green_values = []

while True:
    ret, frame = cap.read()
    if not ret:
        break
    h, w, _ = frame.shape
    ch, cw = h // 4, w // 4
    crop = frame[ch:h-ch, cw:w-cw]
    
    g_mean = np.mean(crop[:, :, 1])
    r_mean = np.mean(crop[:, :, 2])
    red_values.append(r_mean)
    green_values.append(g_mean)

cap.release()

red_sig = np.array(red_values)
green_sig = np.array(green_values)
n_frames = len(red_sig)
time_axis = np.arange(n_frames) / fps
duration = time_axis[-1]

print(f"Total Frames Analyzed: {n_frames}, FPS: {fps:.2f}, Duration: {duration:.2f}s")

# Choose active channel (Red channel is active in this recording)
active_sig = red_sig if np.mean(red_sig) > np.mean(green_sig) else green_sig
active_name = "Red Channel" if np.mean(red_sig) > np.mean(green_sig) else "Green Channel"

sig_detrend = active_sig - np.mean(active_sig)
nyquist = fps / 2.0
b, a = butter(2, [0.75 / nyquist, 2.8 / nyquist], btype="bandpass")
filtered = filtfilt(b, a, sig_detrend)

# FFT Frequency Spectrum
fft_vals = np.abs(np.fft.rfft(filtered))
freqs = np.fft.rfftfreq(len(filtered), d=1.0/fps)

valid_idx = np.where((freqs >= 0.75) & (freqs <= 2.8))[0]
peak_idx = valid_idx[np.argmax(fft_vals[valid_idx])]
peak_freq = freqs[peak_idx]
bpm_fft = peak_freq * 60.0

# Peak Detection
min_dist = int(fps * 0.40) # up to 150 BPM
peaks, _ = find_peaks(filtered, distance=min_dist, prominence=np.std(filtered) * 0.35)

rr_intervals_ms = []
bpm_median = bpm_fft
sdnn = 0.0
rmssd = 0.0

if len(peaks) > 1:
    rr_intervals = np.diff(peaks) / fps
    rr_intervals_ms = rr_intervals * 1000.0
    bpm_median = 60.0 / np.median(rr_intervals)
    sdnn = np.std(rr_intervals_ms)
    diff_rr = np.diff(rr_intervals_ms)
    rmssd = np.sqrt(np.mean(diff_rr ** 2)) if len(diff_rr) > 0 else 0.0

print(f"--- {active_name} PPG Extraction Results ---")
print(f"  Dominant Frequency Peak: {peak_freq:.3f} Hz")
print(f"  Heart Rate (Spectral FFT): {bpm_fft:.1f} BPM")
print(f"  Total Verified Pulses Count: {len(peaks)}")
print(f"  Heart Rate (Median Peak Intervals): {bpm_median:.1f} BPM")
print(f"  Heart Rate Variability (SDNN): {sdnn:.1f} ms")
print(f"  Heart Rate Variability (RMSSD): {rmssd:.1f} ms")

# Generate 4-panel visual chart
fig, (ax1, ax2, ax3, ax4) = plt.subplots(4, 1, figsize=(11, 10))

# 1. Full 56s Raw Signal
ax1.plot(time_axis, active_sig, color='#dc2626', label='Raw Red Channel Signal (Fingertip Perfusion)')
ax1.set_title("1. Full 56.7-Second Raw Optical Intensity (Fingertip Camera Stream)")
ax1.set_ylabel("Pixel Value (0-255)")
ax1.set_xlabel("Time (Seconds)")
ax1.legend(loc='upper right')
ax1.grid(True, alpha=0.3)

# 2. Zoomed 12-Second PPG Waveform
zoom_start = 12.0
zoom_end = 24.0
zoom_mask = (time_axis >= zoom_start) & (time_axis <= zoom_end)
ax2.plot(time_axis[zoom_mask], filtered[zoom_mask], color='#16a34a', linewidth=1.5, label='Filtered PPG Waveform (Red Channel)')
zoom_peaks = [p for p in peaks if zoom_start <= time_axis[p] <= zoom_end]
ax2.plot(time_axis[zoom_peaks], filtered[zoom_peaks], "ro", markersize=6, label=f'Systolic Beats ({len(zoom_peaks)} pulses in 12s)')
ax2.set_title("2. Zoomed Physiological PPG Pulse Waveform (Time Window: 12s - 24s)")
ax2.set_ylabel("Normalized Amplitude")
ax2.set_xlabel("Time (Seconds)")
ax2.legend(loc='upper right')
ax2.grid(True, alpha=0.3)

# 3. FFT Frequency Spectrum
valid_mask = (freqs >= 0.5) & (freqs <= 3.0)
ax3.plot(freqs[valid_mask] * 60, fft_vals[valid_mask], color='#7c3aed', linewidth=1.5, label='Heart Rate Frequency Spectrum')
ax3.axvline(x=bpm_fft, color='#2563eb', linestyle='--', linewidth=2, label=f'Peak Cardiac Rate: {bpm_fft:.1f} BPM')
ax3.set_title(f"3. Spectral Power Density (FFT) -> Resonant Heart Rate: {bpm_fft:.1f} BPM")
ax3.set_xlabel("Heart Rate (Beats Per Minute - BPM)")
ax3.set_ylabel("Spectral Magnitude")
ax3.legend(loc='upper right')
ax3.grid(True, alpha=0.3)

# 4. Instantaneous Heart Rate Tachogram
if len(peaks) > 1:
    beat_times = time_axis[peaks[1:]]
    inst_bpm = 60.0 / (np.array(rr_intervals_ms) / 1000.0)
    ax4.plot(beat_times, inst_bpm, color='#0284c7', marker='o', markersize=3, linestyle='-', linewidth=1.2, label=f'Instantaneous BPM (Mean: {np.mean(inst_bpm):.1f} BPM)')
    ax4.axhline(y=bpm_median, color='#e11d48', linestyle=':', label=f'Median HR: {bpm_median:.1f} BPM')
    ax4.set_title(f"4. 56-Second Beat-to-Beat Tachogram (Heart Rate Variability: SDNN={sdnn:.1f}ms, RMSSD={rmssd:.1f}ms)")
    ax4.set_ylabel("Instantaneous BPM")
    ax4.set_xlabel("Time (Seconds)")
    ax4.set_ylim(max(50, np.percentile(inst_bpm, 1) - 10), min(140, np.percentile(inst_bpm, 99) + 10))
    ax4.legend(loc='upper right')
    ax4.grid(True, alpha=0.3)

plt.tight_layout()
chart_path = r"C:/Users/Asus/.gemini/antigravity/brain/ad3976f8-b7aa-4d8b-924d-0ec5f04fcd2e/v3_ppg_analysis_result.png"
plt.savefig(chart_path, dpi=160)
print(f"Saved Video 3 Diagnostic Chart to: {chart_path}")
