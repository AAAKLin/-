'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { Validator } = require('../../server/lib/validate');
const { validatePayload, BACKUP_FORMAT } = require('../../server/services/backupService');
const { excludedNames } = require('../../server/services/planService');

test('必填字段缺失时收集错误', () => {
  const v = new Validator({});
  assert.throws(() => v.string('name', { required: true }).done(), (err) => {
    assert.equal(err.code, 'VALIDATION_ERROR');
    assert.equal(err.status, 400);
    assert.equal(err.details[0].field, 'name');
    return true;
  });
});

test('枚举校验：非法值被拒绝', () => {
  assert.throws(
    () => new Validator({ status: 'nope' }).string('status', { allowed: ['completed', 'partial'] }).done(),
    (err) => {
      assert.ok(err.details[0].message.includes('只能是'));
      return true;
    },
  );
});

test('数字范围与整数校验', () => {
  assert.throws(() => new Validator({ age: 300 }).number('age', { min: 10, max: 100 }).done());
  assert.throws(() => new Validator({ sets: 1.5 }).number('sets', { integer: true }).done());
  const ok = new Validator({ sets: 3 }).number('sets', { integer: true, min: 1 }).done();
  assert.equal(ok.sets, 3);
});

test('日期格式校验', () => {
  assert.throws(() => new Validator({ date: '2026/01/01' }).date('date').done());
  assert.throws(() => new Validator({ date: 'not-a-date' }).date('date').done());
  const ok = new Validator({ date: '2026-01-01' }).date('date').done();
  assert.equal(ok.date, '2026-01-01');
});

test('默认值：字段缺失时填充', () => {
  const out = new Validator({}).string('meal', { default: 'snack' }).number('servings', { default: 1 }).done();
  assert.equal(out.meal, 'snack');
  assert.equal(out.servings, 1);
});

test('备份校验：格式错误与未知表都会被拒绝', () => {
  assert.ok(validatePayload(null).length > 0);
  assert.ok(validatePayload({ format: 'other', data: {} }).some((e) => e.includes('format')));
  assert.ok(validatePayload({ format: BACKUP_FORMAT, data: { unknown_table: [] } }).some((e) => e.includes('未知数据表')));
  assert.deepEqual(validatePayload({ format: BACKUP_FORMAT, data: { foods: [] } }), []);
});

test('限制关键词会排除相应动作', () => {
  const excluded = excludedNames('膝盖不舒服');
  assert.ok(excluded.has('箭步蹲'));
  assert.ok(excluded.has('开合跳'));
  assert.ok(!excluded.has('平板支撑'));

  const shoulder = excludedNames('肩部疼痛');
  assert.ok(shoulder.has('标准俯卧撑'));
  assert.deepEqual([...excludedNames('')], []);
});
