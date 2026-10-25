import test from 'node:test';
import assert from 'node:assert/strict';
import { LESSONS, lessonLengthBeats } from '../js/lessons.js';
import { OPEN_MIDI } from '../js/music.js';

test('Bài tập hợp lệ: id duy nhất, nốt theo thứ tự, cao độ khớp dây/phím', () => {
  const ids = new Set();
  for (const lesson of LESSONS) {
    assert.ok(!ids.has(lesson.id), `trùng id ${lesson.id}`);
    ids.add(lesson.id);
    assert.ok(lesson.notes.length >= 8);
    assert.ok(lesson.bpm >= lesson.minBpm && lesson.bpm <= lesson.maxBpm);
    let prev = -1;
    for (const n of lesson.notes) {
      assert.ok(n.beat > prev, `${lesson.id}: nhịp không tăng dần`);
      prev = n.beat;
      assert.equal(n.midi, OPEN_MIDI[n.string] + n.fret);
      assert.ok(n.fret >= 0 && n.fret <= 12);
    }
    assert.ok(lessonLengthBeats(lesson) > 0);
  }
});
