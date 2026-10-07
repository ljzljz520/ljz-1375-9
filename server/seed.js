'use strict';
const now = Date.UTC(2026, 9, 1); // 2026-10-01 基准
const DAY = 86400000;

module.exports = function seed() {
  return {
    users: [
      { id: 'u-admin', name: 'admin', pass: 'admin123', role: 'admin' },
      { id: 'u-student', name: 'u-student', pass: 'student123', role: 'user' },
    ],
    history: [
      { id: 'h1', era: '先秦', period: '约前21世纪—前221', title: '琴之滥觞',
        text: '古琴传说始于伏羲、神农削桐为琴。《诗经》“窈窕淑女，琴瑟友之”，说明琴在周代已是礼乐重器，与瑟并称，用于庙堂与士大夫修身。' },
      { id: 'h2', era: '汉魏', period: '前202—265', title: '文人琴的确立',
        text: '司马相如以琴心挑卓文君，嵇康临刑索琴弹《广陵散》。琴从宴飨乐器转为“琴者，禁也”的文人修身之器，出现早期文字谱记录的传统。' },
      { id: 'h3', era: '唐', period: '618—907', title: '雷琴与减字谱前夜',
        text: '蜀中雷氏世家斫琴，雷威制“九霄环佩”传世，造型浑厚、松透古朴。琴学繁荣，陈康士撰《琴书正声》，为后世减字谱体系奠基。' },
      { id: 'h4', era: '宋', period: '960—1279', title: '减字谱与朱长文',
        text: '唐代曹柔首创减字谱，至宋大行；朱长文《琴史》为第一部琴史专著。朱文济、郭沔等名家辈出，琴学义理与审美体系成熟。' },
      { id: 'h5', era: '明清', period: '1368—1911', title: '琴谱刊印与流派纷呈',
        text: '《神奇秘谱》（1425，朱权）是现存最早的古琴曲集。虞山派倡“清微淡远”，徐常遇广陵派崛起，五知斋、自远堂等琴谱相继刊行。' },
      { id: 'h6', era: '近现代', period: '1912至今', title: '打谱、传承与入遗',
        text: '查阜西、管平湖、吴景略等琴家组织今虞琴社、发掘古谱；《幽兰》《广陵散》等经打谱重现。2003年古琴艺术入选联合国教科文组织人类非物质文化遗产。' },
    ],
    schools: [
      { id: 's-ys', name: '虞山派', region: '江苏常熟', founder: '严澂', era: '明末',
        trait: '清微淡远，追求“尽翻窠臼，黜俗归雅”，重视音调与意境。',
        works: ['良宵引', '松弦馆琴谱'] },
      { id: 's-gl', name: '广陵派', region: '江苏扬州', founder: '徐常遇', era: '清初',
        trait: '跌宕起伏、刚柔相济，节奏自由而有吟猱韵味。',
        works: ['梅花三弄', '五知斋琴谱', '自远堂琴谱'] },
      { id: 's-shu', name: '蜀派（川派）', region: '四川', founder: '张孔山', era: '清末',
        trait: '躁急奔放、气势宏伟，《流水》七十二滚拂为其标志。',
        works: ['流水', '天闻阁琴谱'] },
      { id: 's-jp', name: '九嶷派', region: '北京', founder: '杨宗稷', era: '清末民初',
        trait: '苍劲坚实，讲究吟猱节奏，著《琴学丛书》影响近代教学。',
        works: ['渔歌', '琴学丛书'] },
      { id: 's-zh', name: '诸城派', region: '山东诸城', founder: '王溥长', era: '清代',
        trait: '刚劲高古、音韵宽厚，王燕卿传梅庵一脉。',
        works: ['长门怨', '梅庵琴谱'] },
      { id: 's-lz', name: '岭南派', region: '广东', founder: '黄景星', era: '清代',
        trait: '刚健爽朗，保留古貌，《古冈遗谱》传曲。',
        works: ['碧涧流泉', '古冈遗谱'] },
      { id: 's-ph', name: '浦城派（闽派）', region: '福建浦城', founder: '祝凤喈', era: '清代',
        trait: '指法分明、疾徐有致，著《与古斋琴谱》论琴理甚详。',
        works: ['平沙落雁', '与古斋琴谱'] },
    ],
    terms: [
      { id: 't1', term: '散音', pinyin: 'sǎn yīn',
        definition: '左手不按弦，以右手弹空弦所得之音。声如大地，浑厚沉稳。', sources: ['src1'] },
      { id: 't2', term: '按音', pinyin: 'àn yīn',
        definition: '左手按弦于徽分，右手弹弦所得之音，如人之语言，婉转多变。', sources: ['src1', 'src2'] },
      { id: 't3', term: '泛音', pinyin: 'fàn yīn',
        definition: '左手轻点徽位，右手同时弹弦即放，发出清透如天籁的自然倍音。', sources: ['src1'] },
      { id: 't4', term: '吟', pinyin: 'yín',
        definition: '左指按弦得声后，在徽分上下小幅往复摇动，令音韵细密动荡。', sources: ['src2'] },
      { id: 't5', term: '猱', pinyin: 'náo',
        definition: '较吟幅度更大、节奏更缓的左手摇动，古指法或作“犭”，取古猿啼木之意。', sources: ['src2'] },
      { id: 't6', term: '滚拂', pinyin: 'gǔn fú',
        definition: '右手连续摘弦为滚、连续抹弦为拂，二者连用形成流水般的密集音型。', sources: ['src3'] },
      { id: 't7', term: '打谱', pinyin: 'dǎ pǔ',
        definition: '琴人依据减字谱，考证指法、节奏、句读并反复试弹，将古谱转化为可演奏音响的再创造过程。', sources: ['src1'] },
      { id: 't8', term: '减字谱', pinyin: 'jiǎn zì pǔ',
        definition: '唐代曹柔首创，将汉字指法术语减笔拼成符号字，记录弦序、徽位与左右手指法，但不记精确节奏。', sources: ['src1', 'src4'] },
      { id: 't9', term: '徽分', pinyin: 'huī fēn',
        definition: '十三徽之间再细分为十等份，以“徽几分”精确标注按音位置，如七徽六分。', sources: ['src2'] },
    ],
    sources: [
      { id: 'src1', title: '琴史新编', author: '许健', year: 2012, publisher: '中华书局', kind: '专著' },
      { id: 'src2', title: '古琴实用教程', author: '李祥霆', year: 2004, publisher: '上海音乐出版社', kind: '教材' },
      { id: 'src3', title: '天闻阁琴谱', author: '张孔山 等', year: 1876, publisher: '成都叶氏刻本', kind: '古籍' },
      { id: 'src4', title: '神奇秘谱', author: '朱权', year: 1425, publisher: '明刻本', kind: '古籍' },
    ],
    nodes: [
      { id: 'n1', title: '识琴与坐姿', kind: 'fundamental', desc: '琴制、岳山龙龈、安放琴轸、调身调息。' },
      { id: 'n2', title: '右手基本八法', kind: 'technique', desc: '抹挑勾踢打摘摘剌，散音发力。' },
      { id: 'n3', title: '散音练习', kind: 'practice', desc: '空弦均匀发力，《仙翁操》雏形。' },
      { id: 'n4', title: '泛音与十三徽', kind: 'technique', desc: '蜻蜓点水，找准徽位，天声音色。' },
      { id: 'n5', title: '按音与左手走手', kind: 'technique', desc: '按令入木，吟猱绰注，徽分定位。' },
      { id: 'n6', title: '调弦入弄', kind: 'practice', desc: '正调定弦 F-C-D-F-G-A-cd，散按相和调弦法。' },
      { id: 'n7', title: '识读减字谱', kind: 'theory', desc: '上下结构符号字：左手指法+徽位+右手指法+弦序。' },
      { id: 'n8', title: '小曲·仙翁操', kind: 'repertoire', desc: '开指第一曲，散按相应，识谱入门。', scoreId: 'sc-xianweng' },
      { id: 'n9', title: '小曲·良宵引', kind: 'repertoire', desc: '虞山入门短曲，清微淡远。', scoreId: 'sc-liangxiao' },
      { id: 'n10', title: '中曲·流水', kind: 'repertoire', desc: '蜀派张孔山七十二滚拂，进阶大操。', scoreId: 'sc-liushui' },
      { id: 'n11', title: '打谱方法', kind: 'theory', desc: '版本校勘、节奏推敲、句读处理与定拍。' },
    ],
    edges: [
      ['n3', 'n1'], ['n3', 'n2'],
      ['n2', 'n1'],
      ['n4', 'n1'], ['n4', 'n3'],
      ['n5', 'n1'], ['n5', 'n3'],
      ['n6', 'n3'], ['n6', 'n4'],
      ['n7', 'n1'],
      ['n8', 'n2'], ['n8', 'n3'], ['n8', 'n5'], ['n8', 'n7'],
      ['n9', 'n4'], ['n9', 'n5'], ['n9', 'n7'], ['n9', 'n8'],
      ['n10', 'n4'], ['n10', 'n5'], ['n10', 'n6'], ['n10', 'n9'],
      ['n11', 'n7'], ['n11', 'n9'], ['n10', 'n11'],
    ],
    scores: [
      {
        id: 'sc-liushui', title: '流水', school: '蜀派', attribution: '张孔山 传谱（天闻阁本）',
        shareEnabled: true,
        versions: [
          {
            id: 'v-liushui-1876', label: '天闻阁 1876 旧本', published: true, createdAt: now - 900 * DAY,
            current: false,
            license: { validUntil: now - 30 * DAY, note: '旧版数字授权已到期（演示用）' },
            sections: [
              { id: 'ls-a', title: '一·起调散音', notation: '散挑七、勾四，缓作' },
              { id: 'ls-b', title: '二·幽咽泉流', notation: '按音绰注，细吟' },
              { id: 'ls-c', title: '三·七十二滚拂', notation: '滚拂连用，波涛汹涌' },
              { id: 'ls-d', title: '四·余音入杳', notation: '泛音跌岩收束' },
            ],
            media: { id: 'm-liushui-old', durationSec: 120, timecodes: [1.0, 22.5, 48.0, 104.0], wavSeed: 3 },
          },
          {
            id: 'v-liushui-2021', label: '今人打谱整理本（现行）', published: true, createdAt: now - 200 * DAY,
            current: true,
            license: { validUntil: now + 365 * DAY, note: '现行数字授权' },
            sections: [
              { id: 'ls2-a', title: '一·起调', notation: '散挑七、勾四' },
              { id: 'ls2-b1', title: '二上·幽咽（上片）', notation: '绰注细吟，起承' },
              { id: 'ls2-b2', title: '二下·泉流（下片）', notation: '注下复起，转合' },
              { id: 'ls2-c', title: '三·滚拂', notation: '七十二滚拂' },
              { id: 'ls2-d', title: '四·收束', notation: '泛音收尾' },
            ],
            media: { id: 'm-liushui-new', durationSec: 132, timecodes: [1.0, 20.0, 40.0, 60.5, 118.0], wavSeed: 4 },
            mappingFromPrevious: [
              { from: 'ls-a', to: 'ls2-a', kind: 'same' },
              { from: 'ls-b', to: 'ls2-b1', kind: 'split' },
              { from: 'ls-b', to: 'ls2-b2', kind: 'split' },
              { from: 'ls-c', to: 'ls2-c', kind: 'same' },
              { from: 'ls-d', to: 'ls2-d', kind: 'same' },
            ],
          },
        ],
      },
      {
        id: 'sc-xianweng', title: '仙翁操', school: '开指', attribution: '传统开指小曲',
        shareEnabled: true,
        versions: [
          {
            id: 'v-xianweng-1', label: '初学版 v1（现行）', published: true, createdAt: now - 400 * DAY,
            current: true,
            license: { validUntil: now + 500 * DAY },
            sections: [
              { id: 'xw-1', title: '第一节', notation: '散勾四、勾五' },
              { id: 'xw-2', title: '第二节', notation: '名指十徽勾四' },
              { id: 'xw-3', title: '第三节（无时间码示例）', notation: '散挑七，撮如一' },
            ],
            // 3 个段落但只录得 2 个时码：演示“媒体缺时码”-> 锚点降级为仅高亮，谱例仍可读
            media: { id: 'm-xianweng', durationSec: 40, timecodes: [1.5, 14.0], wavSeed: 11 },
          },
        ],
      },
      {
        id: 'sc-liangxiao', title: '良宵引', school: '虞山派', attribution: '严天池 松弦馆本',
        shareEnabled: false, // 演示分享受服务端许可控制
        versions: [
          {
            id: 'v-liangxiao-1', label: '松弦馆本', published: true, createdAt: now - 120 * DAY,
            current: true,
            license: { validUntil: now + 200 * DAY },
            sections: [
              { id: 'lx-1', title: '第一段', notation: '泛音入弄' },
              { id: 'lx-2', title: '第二段', notation: '按音轻吟' },
              { id: 'lx-3', title: '第三段', notation: '泛音结响' },
            ],
            media: { id: 'm-liangxiao', durationSec: 96, timecodes: [2.0, 33.0, 70.0], wavSeed: 7 },
          },
        ],
      },
    ],
    media: [
      { id: 'm-liushui-old', scoreId: 'sc-liushui', versionId: 'v-liushui-1876', title: '流水·旧本录音', durationSec: 120 },
      { id: 'm-liushui-new', scoreId: 'sc-liushui', versionId: 'v-liushui-2021', title: '流水·整理本录音', durationSec: 132 },
      { id: 'm-liangxiao', scoreId: 'sc-liangxiao', versionId: 'v-liangxiao-1', title: '良宵引·录音', durationSec: 96 },
      { id: 'm-xianweng', scoreId: 'sc-xianweng', versionId: 'v-xianweng-1', title: '仙翁操·录音（缺一段时码）', durationSec: 40 },
    ],
    events: {},          // userId|'anon:<clientId>' -> [event]
    sessions: {},        // token -> {userId, createdAt}
    migrationRuns: [],   // 版本迁移判定结果留档
  };
};
