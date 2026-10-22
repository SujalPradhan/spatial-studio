"""Generate a timed, offline narration using macOS's installed Samantha voice."""
import array
import json
import pathlib
import subprocess
import tempfile
import wave

ROOT = pathlib.Path(__file__).resolve().parents[1]
RATE = 22050
DURATION = 76
CUES = [
    (0.15, 8.65, "Can you squeeze a three dimensional arrow onto a flat page? Meet our vector: two across, one up, and two out."),
    (9.2, 13.3, "Watch the blue pen: two across, then one up. That gives us two coordinates. The pink segment shows what the flat plane cannot keep: two units straight out of the page."),
    (23.2, 11.3, "Let's walk around it. The picture changes, but the answer doesn't. Same plane, same projection: two, one. Moving your viewpoint is different from changing the maths."),
    (35.2, 13.3, "Now tilt the page itself. The green arrow stays put, but its projection slides. We're choosing a different pair of directions to keep. Watch the pink gap grow."),
    (49.2, 8.1, "Can we make that gap disappear? Turn the plane toward the arrow. Keep going."),
    (58.2, 5.5, "There! The arrow lies in the plane. For this one vector, nothing is lost."),
    (64.2, 3.4, "Let's return to the original plane."),
    (68.2, 7.5, "Keep two coordinates. Set the third to zero. That's orthogonal projection: keep the in plane part, drop the perpendicular part."),
]

def generate():
    target = ROOT / "public/audio"
    target.mkdir(parents=True, exist_ok=True)
    pcm = array.array("h", [0]) * (RATE * DURATION)
    cues = []
    with tempfile.TemporaryDirectory(prefix="projection-voice-") as directory:
        directory = pathlib.Path(directory)
        for index, (start, budget, text) in enumerate(CUES):
            source, output = directory / "text.txt", directory / "voice.wav"
            source.write_text(text)
            speed = 178
            while True:
                subprocess.run(["say", "-v", "Samantha", "-r", str(speed), "-f", str(source), "-o", str(output), "--file-format=WAVE", "--data-format=LEI16@22050", "--channels=1"], check=True)
                with wave.open(str(output), "rb") as audio:
                    assert audio.getsampwidth() == 2 and audio.getnchannels() == 1 and audio.getframerate() == RATE
                    samples = array.array("h", audio.readframes(audio.getnframes()))
                length = len(samples) / RATE
                if length <= budget:
                    break
                speed += 5
                if speed > 230:
                    raise RuntimeError(f"Cue {index} does not fit its scene; shorten it.")
            offset = round(start * RATE)
            assert offset + len(samples) <= len(pcm)
            pcm[offset:offset + len(samples)] = samples
            cues.append({"start": start, "duration": length, "text": text, "wordsPerMinute": speed})
    with wave.open(str(target / "projection-narration.wav"), "wb") as audio:
        audio.setnchannels(1)
        audio.setsampwidth(2)
        audio.setframerate(RATE)
        audio.writeframes(pcm.tobytes())
    (target / "projection-narration.json").write_text(json.dumps({"voice": "macOS Samantha (synthetic)", "duration": DURATION, "sampleRate": RATE, "cues": cues}, indent=2) + "\n")
    print(f"Generated {DURATION}s narration with {len(cues)} timed cues.")

if __name__ == "__main__":
    generate()
