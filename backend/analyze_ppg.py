import cv2
import numpy as np
import matplotlib.pyplot as plt
from scipy.signal import butter, filtfilt, find_peaks

vpath = r"C:/Users/Asus/.gemini/antigravity/brain/ad3976f8-b7aa-4d8b-924d-0ec5f04fcd2e/.user_uploaded/media_1795375272944_47849ae3.mp4"
cap = cv2.VideoCapture(vpath)
fps = cap.get(cv2.CAP_PROP_FPS)

red_values = []
green_values = []

while True:
    ret, frame = cap.read()
    if not ret:
        break
    h, w, _ = frame.shape
    # Center crop to avoid perimeter flash bleeding
    ch, cw = h // 4, w // 4
    crop = frame[ch:h-ch, cw:w-cw]
    
    # BGR format in OpenCV
    g_mean = np.mean(crop[:, :, 1])
    r_mean = np.mean(crop[:, :, 2])
    red_values.append(r_mean)
    green_values.append(g_mean)

cap.release()

red_sig = np.array(red_values)
green_sig = np.array(green_values)
n_frames = len(red_sig)
time_axis = np.arange(n_frames) / fps

print(f"Total Frames: {n_frames}, FPS: {fps:.2f}, Duration: {time_axis[-1]:.2f} seconds")
print(f"Red Channel Mean: {np.mean(red_sig):.2f}, StdDev: {np.std(red_sig):.4f}")
print(f"Green Channel Mean: {np.mean(green_sig):.2f}, StdDev: {np.std(green_sig):.4f}")

# Bandpass filter for physiological human heart rate (0.75 Hz to 3.0 Hz = 45 to 180 BPM)
def process_channel(sig, name):
    sig_detrend = sig - np.mean(sig)
    nyquist = fps / 2.0
    b, a = butter(2, [0.75 / nyquist, 2.5 / nyquist], btype="bandpass")
    filtered = filtfilt(b, a, sig_detrend)
    
    # FFT Frequency Spectrum
    fft_vals = np.abs(np.fft.rfft(filtered))
    freqs = np.fft.rfftfreq(len(filtered), d=1.0/fps)
    
    valid_idx = np.where((freqs >= 0.75) & (freqs <= 2.5))[0]
    peak_idx = valid_idx[np.argmax(fft_vals[valid_idx])]
    peak_freq = freqs[peak_idx]
    bpm_fft = peak_freq * 60.0
    
    # Peak-to-Peak Time Domain
    min_dist = int(fps * 0.45) # Max ~133 BPM
    peaks, props = find_peaks(filtered, distance=min_dist, prominence=np.std(filtered) * 0.4)
    if len(peaks) > 1:
        rr_intervals = np.diff(peaks) / fps
        bpm_peaks = 60.0 / np.median(rr_intervals)
    else:
        bpm_peaks = bpm_fft
        
    print(f"--- {name} Results ---")
    print(f"  Dominant Frequency: {peak_freq:.3f} Hz")
    print(f"  Heart Rate (FFT): {bpm_fft:.1f} BPM")
    print(f"  Detected Pulse Peaks: {len(peaks)}")
    print(f"  Heart Rate (Peak Intervals): {bpm_peaks:.1f} BPM")
    return filtered, peaks, bpm_fft, bpm_peaks

f_red, peaks_r, bpm_r_fft, bpm_r_pk = process_channel(red_sig, "RED Channel")
f_green, peaks_g, bpm_g_fft, bpm_g_pk = process_channel(green_sig, "GREEN Channel")

# Generate a visual graph of the extracted PPG pulse wave!
fig, (ax1, ax2, ax3) = plt.subplots(3, 1, figsize=(10, 8))

# 1. Raw Red & Green Signal
ax1.plot(time_axis[:300], red_sig[:300], color='red', label='Raw Red Signal')
ax1.set_title("1. Raw Camera Frame Intensity (First 10s)")
ax1.set_ylabel("Pixel Value (0-255)")
ax1.legend()
ax1.grid(True, alpha=0.3)

# 2. Filtered Pulse Wave (PPG)
ax2.plot(time_axis[:300], f_green[:300], color='green', label=f'Filtered PPG Wave (Green Channel)')
# Mark peaks on first 10s
first_10s_peaks = [p for p in peaks_g if p < 300]
ax2.plot(time_axis[first_10s_peaks], f_green[first_10s_peaks], "ro", label='Detected Heartbeats')
ax2.set_title("2. Bandpass Filtered PPG Pulse Wave with Heartbeat Peaks")
ax2.set_ylabel("Normalized Amplitude")
ax2.legend()
ax2.grid(True, alpha=0.3)

# 3. FFT Frequency Spectrum
freqs = np.fft.rfftfreq(len(f_green), d=1.0/fps)
fft_vals = np.abs(np.fft.rfft(f_green))
valid_mask = (freqs >= 0.5) & (freqs <= 3.5)
ax3.plot(freqs[valid_mask] * 60, fft_vals[valid_mask], color='purple', label='Heart Rate Spectrum')
ax3.axvline(x=bpm_g_fft, color='blue', linestyle='--', label=f'Peak Heart Rate: {bpm_g_fft:.1f} BPM')
ax3.set_title(f"3. FFT Frequency Spectrum -> Heart Rate: {bpm_g_fft:.1f} BPM")
ax3.set_xlabel("Beats Per Minute (BPM)")
ax3.set_ylabel("Spectral Energy")
ax3.legend()
ax3.grid(True, alpha=0.3)

plt.tight_layout()
chart_path = r"C:/Users/Asus/.gemini/antigravity/brain/ad3976f8-b7aa-4d8b-924d-0ec5f04fcd2e/ppg_analysis_result.png"
plt.savefig(chart_path, dpi=150)
print(f"Saved PPG visualization chart to: {chart_path}")
