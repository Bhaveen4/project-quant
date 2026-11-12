import { describe, expect, it } from "vitest";

import { createEndpointer, type EndpointEvent } from "./endpointer";

const RATE = 16000;

/** 100 ms of int16 audio: a sine at `amplitude` plus a little noise. */
function chunk(amplitude: number, noise = 40): ArrayBuffer {
  const samples = new Int16Array(RATE / 10);
  for (let i = 0; i < samples.length; i += 1) {
    const tone = amplitude * Math.sin((2 * Math.PI * 220 * i) / RATE);
    samples[i] = Math.round(tone + (Math.random() * 2 - 1) * noise);
  }
  return samples.buffer;
}

function feed(levels: number[], noise?: number): { event: EndpointEvent; atMs: number }[] {
  const endpointer = createEndpointer();
  const events: { event: EndpointEvent; atMs: number }[] = [];
  levels.forEach((level, index) => {
    for (const event of endpointer.push(chunk(level, noise), RATE)) {
      events.push({ event, atMs: (index + 1) * 100 });
    }
  });
  return events;
}

describe("createEndpointer", () => {
  it("reports the start and end of a spoken answer", () => {
    const quiet = Array(5).fill(0);
    const speech = Array(6).fill(4000);
    const events = feed([...quiet, ...speech, ...Array(8).fill(0)]);
    expect(events.map((e) => e.event)).toEqual(["speech_start", "speech_end"]);
    // Speech stops at 1100 ms; the end is reported after ~400 ms of silence.
    expect(events[1].atMs).toBeGreaterThanOrEqual(1400);
    expect(events[1].atMs).toBeLessThanOrEqual(1600);
  });

  it("does not end the utterance on a short pause between words", () => {
    const events = feed([0, 0, 3000, 3000, 0, 0, 3000, 3000, 0, 0, 0, 0, 0, 0]);
    expect(events.map((e) => e.event)).toEqual(["speech_start", "speech_end"]);
  });

  it("ignores steady background noise and a brief click", () => {
    expect(feed(Array(30).fill(150), 60)).toEqual([]);
    const endpointer = createEndpointer();
    endpointer.push(chunk(0), RATE);
    const click = new Int16Array(RATE / 25).fill(20000); // 40 ms
    expect(endpointer.push(click.buffer, RATE)).toEqual([]);
    expect(endpointer.push(chunk(0), RATE)).toEqual([]);
  });

  it("adapts to a louder room and still hears speech above it", () => {
    const room = Array(10).fill(600);
    const events = feed([...room, ...Array(5).fill(6000), ...room]);
    expect(events.map((e) => e.event)).toEqual(["speech_start", "speech_end"]);
  });

  it("hears quieter speech once it is clearly above the room", () => {
    const events = feed([...Array(5).fill(0), ...Array(5).fill(900), ...Array(6).fill(0)], 20);
    expect(events.map((e) => e.event)).toEqual(["speech_start", "speech_end"]);
  });
});
