'use strict';

/**
 * 参考数据种子：动作库、常见食物、示例食谱。
 * 全部为公开常识性参考值，营养值为"估算值"并在 UI 中标注，可由用户修正。
 * 幂等：按名称去重，重复运行不会产生重复数据。
 */

const { getDb } = require('./index');

// 动作库：优先无器械/低器械，适合初学者在家训练
// 字段顺序：名称, 类别, 动作模式, 器械, 难度, 是否计时, 默认组数, 默认次数, 默认秒数, 组间休息秒, 动作提示
const EXERCISES = [
  ['靠墙静蹲', 'strength', 'squat', 'none', 'beginner', 1, 3, 0, 30, 45, '腰背贴墙，膝盖不超过脚尖，感到大腿发力即可停下休息'],
  ['徒手深蹲', 'strength', 'squat', 'none', 'beginner', 0, 3, 12, 0, 60, '脚与肩同宽，下蹲时膝盖沿脚尖方向，背部保持挺直'],
  ['臀桥', 'strength', 'hip_hinge', 'none', 'beginner', 0, 3, 15, 0, 45, '顶峰收紧臀部 1 秒再落下，不要用腰顶起'],
  ['箭步蹲', 'strength', 'lunge', 'none', 'beginner', 0, 3, 8, 0, 60, '每侧 8 次；膝盖轻触地面前停住，身体不要左右晃'],
  ['台阶上下', 'strength', 'lunge', 'chair', 'beginner', 0, 3, 10, 0, 60, '用稳固的台阶或椅子，全脚掌踩实，慢上慢下'],
  ['提踵', 'strength', 'calf', 'none', 'beginner', 0, 3, 15, 0, 45, '扶墙保持平衡，抬起时停 1 秒'],
  ['上斜俯卧撑（撑桌/台阶）', 'strength', 'push', 'none', 'beginner', 0, 3, 10, 0, 60, '手撑稳固台面，身体成一条直线，胸口靠近台面'],
  ['跪姿俯卧撑', 'strength', 'push', 'none', 'beginner', 0, 3, 8, 0, 75, '膝盖着地，核心收紧，肩胛骨下沉，不要塌腰'],
  ['标准俯卧撑', 'strength', 'push', 'none', 'intermediate', 0, 3, 6, 0, 90, '肩腕同宽，身体一条直线，胸口贴地再推起'],
  ['毛巾划船（门把固定）', 'strength', 'pull', 'none', 'beginner', 0, 3, 12, 0, 60, '用毛巾绕稳固门把，肘部后夹，肩胛骨向中间收'],
  ['弹力带划船', 'strength', 'pull', 'band', 'beginner', 0, 3, 12, 0, 60, '弹力带固定在不晃动处，拉到肘部超过躯干'],
  ['俯卧 Y 字抬臂', 'strength', 'pull', 'none', 'beginner', 0, 3, 10, 0, 45, '俯卧，双臂成 Y 字缓慢抬起，颈部放松'],
  ['平板支撑', 'core', 'plank', 'none', 'beginner', 1, 3, 0, 30, 60, '核心收紧，臀部不下塌也不撅起，呼吸保持平稳'],
  ['卷腹', 'core', 'crunch', 'none', 'beginner', 0, 3, 12, 0, 45, '下背贴地，用腹部卷起，不要用手拽脖子'],
  ['死虫式', 'core', 'anti_extension', 'none', 'beginner', 0, 3, 10, 0, 45, '腰部始终贴地，对侧手脚缓慢伸展'],
  ['鸟狗式', 'core', 'anti_rotation', 'none', 'beginner', 0, 3, 8, 0, 45, '支撑手肩同宽，伸展时骨盆保持水平不倾斜'],
  ['开合跳', 'cardio', 'cardio', 'none', 'beginner', 1, 3, 0, 40, 60, '落地屈膝缓冲，膝踝不适可改为原地踏步'],
  ['原地高抬腿', 'cardio', 'cardio', 'none', 'beginner', 1, 3, 0, 30, 60, '膝盖抬到髋部高度，节奏由慢到快'],
  ['快走 / 慢跑', 'cardio', 'cardio', 'none', 'beginner', 1, 1, 0, 1200, 0, '能边说话边运动的强度；胸闷头晕请立即停下'],
  ['胸大肌静态拉伸', 'mobility', 'stretch', 'none', 'beginner', 1, 2, 0, 30, 30, '手扶墙角，身体缓慢前移，肩部有牵拉感即可'],
  ['髋屈肌拉伸', 'mobility', 'stretch', 'none', 'beginner', 1, 2, 0, 30, 30, '弓步后腿膝盖着地，收腹避免腰部代偿'],
  ['腘绳肌拉伸', 'mobility', 'stretch', 'none', 'beginner', 1, 2, 0, 30, 30, '一腿微屈前伸，背部保持挺直，缓慢前倾'],
];

// 常见食物：每 100 克可食部的参考营养值（公开食物成分表近似值，标注为估算）
const FOODS = [
  ['米饭（熟）', 'staple', '一碗 150 克', 150, 116, 2.6, 0.3, 25.9, 0, 1],
  ['米饭（生米）', 'staple', '100 克', 100, 346, 7.4, 0.8, 77.9, 0, 1],
  ['馒头', 'staple', '一个 100 克', 100, 223, 7.0, 1.1, 47.0, 1, 1],
  ['全麦面包', 'staple', '一片 35 克', 35, 246, 9.0, 3.2, 45.0, 1, 0],
  ['燕麦片（干）', 'staple', '一份 40 克', 40, 377, 15.0, 6.7, 61.0, 0, 1],
  ['红薯（蒸熟）', 'staple', '一个 180 克', 180, 86, 1.6, 0.1, 20.1, 0, 1],
  ['土豆（蒸熟）', 'staple', '一个 150 克', 150, 81, 2.6, 0.2, 17.8, 0, 1],
  ['玉米（鲜）', 'staple', '一根 200 克', 200, 112, 4.0, 1.2, 22.8, 0, 1],
  ['意大利面（干）', 'staple', '一份 80 克', 80, 351, 12.5, 1.5, 74.0, 0, 0],
  ['鸡胸肉（生）', 'protein', '一块 150 克', 150, 133, 19.4, 5.0, 2.5, 0, 1],
  ['鸡胸肉（水煮）', 'protein', '一块 120 克', 120, 165, 31.0, 3.6, 0.0, 1, 1],
  ['鸡腿肉（去皮）', 'protein', '一块 120 克', 120, 146, 19.0, 7.5, 0.0, 1, 1],
  ['鸡蛋（全蛋）', 'protein', '一个 50 克', 50, 143, 12.6, 9.5, 0.7, 0, 1],
  ['鸡蛋（蛋白）', 'protein', '一个 33 克', 33, 60, 11.6, 0.1, 0.7, 0, 1],
  ['瘦猪肉', 'protein', '100 克', 100, 143, 20.3, 6.2, 1.5, 1, 1],
  ['牛腱子肉', 'protein', '100 克', 100, 106, 20.0, 2.2, 1.7, 0, 0],
  ['三文鱼', 'protein', '一块 120 克', 120, 139, 17.2, 7.8, 0.0, 0, 0],
  ['巴沙鱼', 'protein', '一块 150 克', 150, 90, 18.0, 1.5, 0.0, 1, 1],
  ['虾仁', 'protein', '100 克', 100, 93, 18.6, 0.8, 2.8, 0, 0],
  ['金枪鱼罐头（水浸）', 'protein', '一罐 80 克', 80, 116, 25.5, 0.8, 0.0, 1, 0],
  ['北豆腐', 'protein', '一块 200 克', 200, 116, 12.2, 4.8, 4.2, 0, 1],
  ['嫩豆腐', 'protein', '一盒 300 克', 300, 57, 6.2, 2.5, 2.4, 0, 1],
  ['无糖豆浆', 'protein', '一杯 250 毫升', 250, 31, 3.0, 1.6, 1.2, 0, 1],
  ['全脂牛奶', 'dairy', '一杯 250 毫升', 250, 65, 3.3, 3.6, 4.9, 0, 1],
  ['无糖希腊酸奶', 'dairy', '一杯 150 克', 150, 59, 10.3, 0.4, 3.6, 1, 0],
  ['乳清蛋白粉', 'supplement', '一勺 30 克', 30, 380, 80.0, 5.0, 8.0, 1, 0],
  ['西兰花', 'vegetable', '一份 150 克', 150, 36, 4.1, 0.6, 4.3, 0, 1],
  ['菠菜', 'vegetable', '一份 150 克', 150, 24, 2.6, 0.3, 4.5, 0, 1],
  ['番茄', 'vegetable', '一个 150 克', 150, 20, 0.9, 0.2, 4.0, 0, 1],
  ['黄瓜', 'vegetable', '一根 200 克', 200, 16, 0.8, 0.2, 2.9, 0, 1],
  ['胡萝卜', 'vegetable', '一根 100 克', 100, 41, 1.0, 0.2, 9.6, 0, 1],
  ['生菜', 'vegetable', '一份 100 克', 100, 15, 1.4, 0.2, 2.1, 0, 1],
  ['苹果', 'fruit', '一个 200 克', 200, 53, 0.2, 0.2, 13.5, 0, 1],
  ['香蕉', 'fruit', '一根 120 克', 120, 93, 1.4, 0.2, 22.0, 0, 1],
  ['蓝莓', 'fruit', '一份 100 克', 100, 57, 0.7, 0.3, 14.5, 0, 0],
  ['花生米', 'fat', '一小把 25 克', 25, 567, 25.8, 49.2, 16.1, 0, 1],
  ['核桃仁', 'fat', '一份 20 克', 20, 646, 15.2, 65.2, 13.7, 0, 0],
  ['橄榄油', 'fat', '一勺 10 克', 10, 884, 0.0, 100.0, 0.0, 0, 0],
  ['菜籽油', 'fat', '一勺 10 克', 10, 899, 0.0, 99.9, 0.0, 0, 1],
  ['酱油', 'condiment', '一勺 15 克', 15, 63, 5.6, 0.1, 10.1, 1, 1],
];

// 示例食谱：食材用量可在 UI 中修改
const RECIPES = [
  {
    name: '鸡胸肉糙米碗（一人份）',
    servings: 1,
    note: '低预算高蛋白午餐模板，食材与用量均可修改',
    items: [
      ['米饭（熟）', 250],
      ['鸡胸肉（水煮）', 120],
      ['西兰花', 150],
      ['橄榄油', 5],
    ],
  },
  {
    name: '鸡蛋燕麦早餐',
    servings: 1,
    note: '5 分钟可完成的早餐模板',
    items: [
      ['燕麦片（干）', 40],
      ['鸡蛋（全蛋）', 100],
      ['全脂牛奶', 200],
      ['苹果', 100],
    ],
  },
  {
    name: '豆腐蔬菜汤',
    servings: 2,
    note: '低脂晚餐模板，可做两人份',
    items: [
      ['北豆腐', 200],
      ['菠菜', 150],
      ['胡萝卜', 80],
      ['菜籽油', 5],
    ],
  },
];

function seedReferenceData(options = {}) {
  const db = options.db || getDb();
  const now = new Date().toISOString();

  const insertExercise = db.prepare(`
    INSERT INTO exercises (name, category, movement, equipment, level, is_time_based, default_sets, default_reps, default_duration_sec, rest_sec, cue, origin)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'seed')
  `);
  const findExercise = db.prepare('SELECT id FROM exercises WHERE name = ?');
  for (const row of EXERCISES) {
    if (findExercise.get(row[0])) continue;
    insertExercise.run(...row);
  }

  // 逐步建立难度递进关系（用于规则化的"退阶/进阶"建议）
  const linkAlternative = db.prepare('UPDATE exercises SET easier_alternative_id = ?, harder_alternative_id = ? WHERE id = ?');
  const idOf = (name) => {
    const r = findExercise.get(name);
    return r ? r.id : null;
  };
  const links = [
    ['跪姿俯卧撑', '上斜俯卧撑（撑桌/台阶）', '标准俯卧撑'],
    ['徒手深蹲', '靠墙静蹲', '箭步蹲'],
    ['平板支撑', null, '死虫式'],
  ];
  for (const [name, easier, harder] of links) {
    const id = idOf(name);
    if (!id) continue;
    linkAlternative.run(easier ? idOf(easier) : null, harder ? idOf(harder) : null, id);
  }

  const insertFood = db.prepare(`
    INSERT INTO foods (name, category, serving_label, serving_grams, kcal, protein, fat, carb, is_estimate, budget_friendly, origin, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'seed', ?, ?)
  `);
  const findFood = db.prepare('SELECT id FROM foods WHERE name = ?');
  for (const [name, category, label, grams, kcal, protein, fat, carb, estimate, budget] of FOODS) {
    if (findFood.get(name)) continue;
    insertFood.run(name, category, label, grams, kcal, protein, fat, carb, estimate, budget, now, now);
  }

  const insertRecipe = db.prepare(`
    INSERT INTO recipes (name, servings, note, origin, created_at, updated_at) VALUES (?, ?, ?, 'seed', ?, ?)
  `);
  const findRecipe = db.prepare('SELECT id FROM recipes WHERE name = ?');
  const insertRecipeItem = db.prepare('INSERT INTO recipe_items (recipe_id, food_id, grams) VALUES (?, ?, ?)');
  for (const recipe of RECIPES) {
    if (findRecipe.get(recipe.name)) continue;
    const info = insertRecipe.run(recipe.name, recipe.servings, recipe.note, now, now);
    const recipeId = Number(info.lastInsertRowid);
    for (const [foodName, grams] of recipe.items) {
      const food = findFood.get(foodName);
      if (!food) continue;
      insertRecipeItem.run(recipeId, food.id, grams);
    }
  }
}

function ensureDefaultProfile(options = {}) {
  const db = options.db || getDb();
  const now = new Date().toISOString();
  const existing = db.prepare('SELECT * FROM profile WHERE id = 1').get();
  if (existing) return existing;
  db.prepare(`
    INSERT INTO profile (id, sex, age, height_cm, weight_kg, activity_level, goal, experience,
      available_days, session_minutes, equipment, limitations, budget_level, target_source, created_at, updated_at)
    VALUES (1, 'male', 30, 170, 70, 'light', 'fat_loss', 'beginner', 3, 40, 'none', '', 'low', 'auto', ?, ?)
  `).run(now, now);
  return db.prepare('SELECT * FROM profile WHERE id = 1').get();
}

module.exports = { seedReferenceData, ensureDefaultProfile, EXERCISES, FOODS, RECIPES };
