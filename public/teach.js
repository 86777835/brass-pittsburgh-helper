// 3-minute teach: a script the teacher reads aloud to start a first game, written from the official rulebook v2026.01
// (same wording as tools/讲解稿.md). It names every important element in a sentence and leaves the fine rulings to the
// rules assistant. Terms in {text|id} open a note with a picture cropped from the rulebook (img/teach/<icon>.webp); the
// 「问」 buttons and each note's 「问规则助手」 ask the rules assistant (chat.js) straight away.
// The pictures are cut from Roxley's official rulebook (user's call, 2026-11-12); the page footer credits it.
const ICON = (id, cls = '') => id ? `<img class="ico ${cls}" src="img/teach/${id}.webp" alt="">` : '';

// id: name, where you see it on the table, what it means. icon: a picture in img/teach/.
const TERMS = {
  vp: { name: '胜利点', icon: 'vp', where: '黑色六边形里写着数字：版图外圈的分数轨、产业板块左下角、市场格子上。', what: '就是分数。两个时代打完，胜利点最多的人赢。' },
  link: { name: '连线点', icon: 'link', where: '深蓝圆形里一个双向箭头：地点名牌上、产业板块右上角。', what: '时代结束时，你的每条火车两头的地点上每有一个连线点，这条火车就得 1 分。' },
  era1: { name: '第一时代图标', icon: 'era1', where: '左半边是蓝色的圆：产业板块的费用下方。', what: '画着它的板块只能在第一时代建造。' },
  era2: { name: '第二时代图标', icon: 'era2', where: '左半边是黑色的圆：产业板块的费用下方。', what: '画着它的板块只能在第二时代建造。' },
  era: { name: '时代', icon: 'era1', where: '版图上的轮次标记。', what: '游戏分两个时代，每个时代 8 轮。牌堆摸完、大家手牌打光的那一轮结束，时代就结束。' },
  income: { name: '收入等级', icon: 'income', where: '收入标记所在那一格旁边硬币上的数字。', what: '每轮结束按这个数拿钱，是负数就付钱。注意“格”和“等级”不一样：加收入按格前进，减收入按等级后退。' },
  money: { name: '钱', icon: 'money', where: '金色硬币：产业板块左侧的费用、市场格子的价格。', what: '本轮花掉的钱放在自己的角色板块上，轮末按花了多少重排顺位。' },
  cubes: { name: '资源方块', icon: 'cubes', where: '市场格子里、产业板块上的小方块。', what: '四种：煤（黑）、铁（橙）、钢（灰）、焦炭（红）。只能沿火车线运输，谁的火车都行，管道不行。' },
  coal: { name: '煤', icon: 'coal', where: '黑色方块：煤矿板块上、版图里面的煤和铁市场。', what: '修一条轻型火车要 1 煤，很多产业建造也要用。' },
  iron: { name: '铁', icon: 'iron', where: '橙色方块：钢铁厂板块上、版图里面的煤和铁市场。', what: '铺一条管道要 1 铁；发展行动每移除一块板块，付 1 铁或 1 钢。' },
  steel: { name: '钢', icon: 'steel', where: '灰色方块：钢铁厂板块上、版图四周的钢和焦炭市场。', what: '修一条重型火车要 2 钢；发展时也可以用钢代替铁。' },
  coke: { name: '焦炭', icon: 'coke', where: '红色方块：焦炭厂板块上、版图四周的钢和焦炭市场。', what: '一些产业建造时要用。' },
  oil: { name: '石油', icon: 'oil', where: '银色油桶：油田上、通往油田的管道路线上。', what: '出售大多要用。石油离开油田的第一步必须走管道，之后和资源方块一样沿火车线走。油流过一条管道，管道主人就拿那条管道的奖励。' },
  whiskey: { name: '威士忌', icon: 'whiskey', where: '酒瓶：放在你的玩家板上，最多 3 瓶，多的作废。', what: '花一瓶：建造时把任意一张牌当成任意地点牌或产业牌；或者出售时加一颗品质星。“过”行动就是拿一瓶。' },
  star: { name: '品质星', icon: 'star', where: '金色四角星：可出售的产业板块上。', what: '出售时数一数卖掉的板块上有几颗星（每瓶威士忌再加一颗），够数就能拿一个品质奖励。' },
  qreward: { name: '品质奖励', icon: 'qreward', where: '印着几颗星的板块，开局翻开 3 个。', what: '一次出售的星星总数达到要求，就拿它的奖励并翻面。每次出售最多拿一个。' },
  upgrade: { name: '升级图标', icon: 'upgrade', where: '部分产业板块左侧的费用里。', what: '这种板块不能建在空格上，只能替换你自己一个已翻面的指定产业。旧板块移走，立刻得它的分。' },
  level: { name: '产业等级', icon: 'level', where: '产业板块左上角的罗马数字。', what: '等级越高越强。第一时代结束时，地图上所有一级板块都会被移走。' },
  tile: { name: '产业板块', icon: 'tile', where: '紫色方形板块：开局叠在玩家板上，建造后放到地图上。', what: '你的工厂。左边是建造费用，右下角是产出或翻面奖励，左下角是翻面后时代末的分数。' },
  flip: { name: '翻面', icon: 'flip', where: '产业板块深色的那一面。', what: '产业卖掉了，或者上面的资源被拿光了，就翻面，主人立刻拿右下角的奖励。时代结束时只有翻过面的板块计分。' },
  reward: { name: '翻面奖励', icon: 'reward', where: '产业板块翻面后右下角的图标。', what: '翻面那一刻立刻拿到，比如加收入、拿钱、拿威士忌或一次额外出售。分数不在这时拿，要等时代结束。' },
  oilreq: { name: '所需石油', icon: 'oilreq', where: '可出售产业板块右上角，画着油桶和数字。', what: '出售这块板块要先拿到这么多桶油。' },
  light: { name: '轻型火车', icon: 'light', where: '你颜色的小火车，开局 9 辆在个人供应区。', what: '网络行动放在铁路线上，付 1 煤。用来运资源和石油，时代结束时计分；第一时代结束后拿回来，可以再建。' },
  heavy: { name: '重型火车', icon: 'heavy', where: '大一号的火车板块：开局个人供应区有 2 辆，其余在玩家板上，解锁后可用。', what: '付 2 钢。和轻型火车一样运输、计分，但建好立刻有奖励，第一时代结束时也不拿走。' },
  pipe: { name: '管道', icon: 'pipe', where: '管子形状的板块：开局个人供应区有 2 条，其余在玩家板上。', what: '付 1 铁，放在地点和油田之间的黑色路线上。石油出油田必须先走管道；每流过一桶油，管道主人拿奖励。管道不计分。' },
  order: { name: '顺位轨', icon: 'order', where: '版图上放角色板块的一排格子。', what: '从左到右就是这一轮的行动顺序。轮末按这轮花的钱从少到多重排：花得少的先。' },
  location: { name: '地点', icon: 'location', where: '版图上带名牌的城市，以及商人格。', what: '有铁路线连着的地方才算地点，油田不算。你的网络 = 有你产业板块的地点 + 和你的火车或管道相邻的地点。' },
  connected: { name: '连通', icon: 'light', where: '看地图上的火车线。', what: '两个地点之间有一串连续的火车链接，不管是谁的，就算连通。管道不算。' },
  market: { name: '市场', icon: 'market', where: '标着价格的一列格子：煤和铁市场在版图里面，钢和焦炭市场在版图四周。', what: '买资源时按格子上的价格付钱，要和你需要资源的地方连通。新建的产业也会把资源先卖进连通的市场。' },
  merchant: { name: '商人', icon: 'merchant', where: '版图边上的盾形板块，画着它收哪些产业。', what: '出售时，产业要连通到画有这种产业图标的商人。卖给正面朝上的商人还能拿它的奖励，拿完翻面。' },
  oilfield: { name: '油田', icon: 'oilfield', where: '版图上的六边形板块，开局背面朝上。', what: '第一条管道连上它时翻开，连管道的人拿左边的奖励；右边画的油会加入油田（第一时代翻开的，要等第一时代结束才加）。油田不算地点。' },
  vanderbilt: { name: '范德比尔特', icon: 'vanderbilt', where: '版图上的人物肖像，旁边标着价格。', what: '实在拿不到资源时找他，不用连通，但贵：煤和铁 7 元一个，钢和焦炭 10 元一个。' },
  crown: { name: '皇冠明珠产业', icon: 'skyscraper', where: '玩家板产业轨道的顶端或支线上，一共四种。', what: '后期很强的特殊产业：石油城、机车厂、多相交流发电机、摩天楼。各自效果不同，点下面的「问」或分别点开看。' },
  oilcity: { name: '石油城', icon: 'oilcity', where: '煤油轨道顶端。', what: '只在第二时代、用“石油城”牌建，直接建在已有管道连着的油田上：油田的油全部挪上来再加 3 桶，谁都能经连通的管道用。最后一桶用掉时翻面，奖励 25 元。' },
  loco: { name: '机车厂', icon: 'loco', where: '制造业轨道顶端。', what: '只在第二时代建，建好就是翻面的：升级你一个制造业产业，送 3 次免费发展；时代结束时，你建过的每辆重型火车得 4 分。' },
  polyphase: { name: '多相交流发电机', icon: 'polyphase', where: '煤炭轨道顶端。', what: '建好就是翻面的：升级你一个煤矿，立刻拿当前收入等级 2 倍的钱；时代结束时，你玩家板上每个空出来的产业格得 1 分。' },
  skyscraper: { name: '摩天楼', icon: 'skyscraper', where: '钢铁轨道分出的支线上。', what: '建好就是翻面的：立刻送你一次额外的出售，不用弃牌，要马上做。' },
  kerosene: { name: '煤油精炼厂', icon: 'kerosene', where: '玩家板上的煤油轨道。', what: '可以出售的产业之一，卖给连通的商人，通常要用石油。' },
  manuf: { name: '制成品', icon: 'manuf', where: '玩家板上的制造业轨道。', what: '可以出售的产业之一，卖给连通的商人。' },
  auto: { name: '汽车厂', icon: 'auto', where: '玩家板上的制造业轨道，靠上的位置。', what: '可以出售的产业之一，卖给连通的商人。' },
  coalmine: { name: '煤矿', icon: 'coalmine', where: '玩家板上的煤炭轨道。', what: '建好时放上煤，能卖就先卖进连通的煤市场；剩下的煤被拿光时翻面。' },
  cokeoven: { name: '焦炭厂', icon: 'cokeoven', where: '玩家板上的焦炭轨道。', what: '建好时放上焦炭，用法和煤矿一样。' },
  ironsteel: { name: '钢铁厂', icon: 'ironsteel', where: '玩家板上的钢铁轨道。', what: '建好时放上铁或钢（看板块右下角画的方块），用法和煤矿一样。' }
};

// The script: what to read aloud. Every important element gets one sentence; how it is ruled exactly is for the assistant.
const PARTS = [
  { title: '怎么赢', sec: 25, lines: [
    '这局玩《工业革命：匹兹堡》。我先讲一遍主流程，讲完再一条条过注意事项。',
    '我们是 1865 年的匹兹堡工业大亨：开工厂、修铁路、铺油管。',
    '游戏分两个{时代|era}，每个时代 8 轮，打完{胜利点|vp}最多的人赢。',
    '分数主要来自两处：{翻过面|flip}的{产业板块|tile}左下角的分；还有你的火车，两头地点上的{连线点|link}越多越值钱。'
  ], ask: ['胜利点主要从哪里来？', '产业板块什么时候会翻面？'] },
  { title: '一轮怎么走', sec: 30, lines: [
    '按{顺位轨|order}从左到右轮流，每人做 2 个行动，可以重复；只有第一时代第一轮，每人只做 1 个。',
    '每个行动都要弃一张牌，做完摸回 8 张。',
    '这一轮花的{钱|money}放在自己的角色板块上，轮末花得少的下一轮先走。',
    '然后每人按{收入等级|income}拿钱；收入是负的就付钱。'
  ], ask: ['花的钱一样多，顺位怎么排？', '手牌用完后怎么办？', '付不起负收入会怎样？'] },
  { title: '你的玩家板', sec: 35, lines: [
    '玩家板上有五条产业轨道：{煤油精炼厂|kerosene}、{煤矿|coalmine}、{制成品|manuf}（往上是{汽车厂|auto}）、{焦炭厂|cokeoven}、{钢铁厂|ironsteel}。',
    '每条轨道只能用最下面那块，或者顺着箭头的下一块；板块左上角是{等级|level}。',
    '板块左边是费用。费用下面的{时代图标|era1}说明它只能在哪个时代建；画着{升级图标|upgrade}的，要替换你自己一个已翻面的产业。',
    '轨道顶端有四种很强的{皇冠明珠产业|crown}：{石油城|oilcity}、{机车厂|loco}、{多相交流发电机|polyphase}和{摩天楼|skyscraper}。'
  ], ask: ['能覆盖建造吗？「升级」怎么做？', '机车厂和摩天楼有什么效果？'] },
  { title: '六种行动', sec: 70, lines: [
    '**建造**：把产业板块放到地图上的{地点|location}，弃一张对应的地点牌或产业牌，付钱和{资源|cubes}。',
    '**网络**：放一条{轻型火车|light}（1 煤）、{重型火车|heavy}（2 钢）或{管道|pipe}（1 铁）。重型火车建好就有奖励；每当有油流过你的管道，你也拿奖励。',
    '**出售**：把煤油、制成品、汽车卖给{连通|connected}的{商人|merchant}，按板块右上角付{石油|oilreq}。正面朝上的商人还会给奖励。卖掉的板块翻面，拿右下角的{奖励|reward}。',
    '出售时数一数卖掉的板块上有几颗{品质星|star}，够数就能拿一个{品质奖励|qreward}。',
    '**发展**：花{铁|iron}或{钢|steel}，扔掉玩家板上一两块低级板块。',
    '**贷款**：拿 30 元，收入降 3 级。',
    '**过**：拿一瓶{威士忌|whiskey}。威士忌能把任意牌当万能牌用，或者出售时多算一颗品质星。'
  ], ask: ['出售需要什么条件？', '品质奖励怎么领取？一次出售能领几个？', '替换火车、双倍火车、威士忌火车各有什么效果？'] },
  { title: '资源和石油', sec: 40, lines: [
    '{资源方块|cubes}有{煤|coal}、{铁|iron}、{钢|steel}、{焦炭|coke}四种，只能沿{连通|connected}的火车线运，谁的火车都行，管道不行。',
    '煤矿、焦炭厂、钢铁厂建好时放上资源，能卖进连通的{市场|market}就先卖，卖一个拿一份钱和分。',
    '要用资源时：先从连通的板块上免费拿，能拿就必须拿；不行就去连通的市场买；再不行找{范德比尔特|vanderbilt}，贵，但不用连通。板块上的资源被拿光，它就翻面。',
    '{石油|oil}在{油田|oilfield}里，出油田的第一步必须走管道。第一个用管道连上油田的人把它翻开，拿奖励。'
  ], ask: ['消耗资源的优先顺序是什么？', '石油怎么运输？', '管道连到油田时会发生什么？'] },
  { title: '时代结束', sec: 30, lines: [
    '牌堆摸完、大家手牌打光的那一轮结束，时代就结束。',
    '计两项分：你的每条火车，两头地点上有几个{连线点|link}就得几分；每个{翻过面|flip}的产业板块按左下角得分。',
    '第一时代结束后：轻型火车拿回来，地图上的一级板块全部移走，弃牌洗好每人再摸 8 张。',
    '第二时代打完，{胜利点|vp}最多的人赢。流程就这些，接下来过一遍注意事项。'
  ], ask: ['时代结束时按什么顺序计分？', '第1时代建的工业到第2时代还会再计分吗？'] }
];

// 注意事项: fine points outside the main flow that are easy to get wrong. Read them one by one after the script.
// Each has a written answer (from tools/faq.json, i.e. the rulebook); what is not here goes to the rules assistant.
// [title, answer, question for the assistant]
const NOTES = [
  ['花的钱一样多，顺位怎么排', '保持原来的先后不变。花掉的钱先放在自己的角色板块上，轮末排完顺位再一起还给银行。', '下一轮的顺位怎么决定？花费相同怎么办？'],
  ['收入的“格”和“等级”', '加收入按格往前走，走 5 格可能只升 2 级；减收入按等级往后退，标记放在新等级的最高那一格。整局最后一轮结束后不再结算收入。', '收入「等级」和「格」有什么区别？'],
  ['付不起负收入（破产）', '不用卖产业。交回全部{威士忌|whiskey}，扣 40 分（可以扣成负分），收入标记移回 0 收入那一格，然后接着玩。', '付不起负收入（破产）会怎样？'],
  ['第一时代一个地点只能建一个', '第一时代，每个{地点|location}你自己只能建 1 个产业板块；第二时代没有这个限制。', '第1时代一个地点能建几个工业？'],
  ['建在哪个空格', '地点里有只画着这种产业的空格，就必须建在那；没有，才能建在画着好几种产业的空格。都没有就不能建。', '地点里有多个空格时建在哪？时代图标是什么意思？'],
  ['用哪种牌建造', '地点牌：在那个地点建，不用在你的网络里。产业牌：在你网络里的地点建对应产业；地图上还没有你任何板块和链接时，可以建在任意地点。任意牌加 1 瓶威士忌，可以当成任意一种牌。', '建造时地点牌、工业牌、威士忌分别怎么用？'],
  ['没有覆盖建造，只有升级', '费用里画着{升级图标|upgrade}的板块，只能替换你自己一个已翻面、类型对得上的产业（等级不限），旧板块立刻拿分后移走。它不能建在空格上。', '能覆盖建造吗？「升级」怎么做？'],
  ['建好就是翻面的板块', '板块上的{奖励|reward}建好时立刻拿；分数不立刻拿，等时代结束，或者它被升级替换时才算。', '有些板块建好时就已翻面，它们的奖励和分数何时结算？'],
  ['资源先拿谁的', '只要{连通|connected}的、没翻面的产业板块上有，就必须先免费拿（谁的都行）。拿不到才在自己的资源火车、连通的{市场|market}和{范德比尔特|vanderbilt}之间选。范德比尔特不用连通：煤和铁 7 元，钢和焦炭 10 元。和伯明翰不同，铁也要靠火车线运。', '消耗资源的优先顺序是什么？有相连市场时还能找范德比尔特吗？'],
  ['产出的资源只在建造那一刻卖', '煤矿、焦炭厂、钢铁厂建好那一刻，和连通的同类市场有空位就尽量卖进去，每个拿价钱和那一格的分。卖不掉的留在板块上，之后不会再自动卖。', '建好产资源的工业后，资源会自动卖给市场吗？'],
  ['石油怎么走', '石油出{油田|oilfield}的第一步必须走{管道|pipe}，之后沿火车线走。管道不能运资源方块；范德比尔特也不卖石油。', '石油怎么运输？能向范德比尔特买石油吗？'],
  ['一次网络行动放两条', '可以多付 10 元再放第二条，第二条照样付它自己的资源，种类可以不同；先结算第一条，再放第二条。火车放在画着威士忌、收入或免费发展的铁路线上，立刻拿这个奖励。', '网络行动的费用是多少？一次能建几条？'],
  ['管道算网络，但不算连通', '和你的管道相邻的地点也算你的网络，可以在那建造。但判断两地“连通”（运东西、找商人）只看火车。油田不算地点。', '管道算我的网络吗？油田是地点吗？'],
  ['重型火车、管道要解锁', '开局手上只有 2 辆{重型火车|heavy}、2 条管道和 9 辆轻型火车，其余锁在玩家板上，等正下方的产业建掉或发展掉才放出来。资源火车上的钢、焦炭、油只有主人能用，钢火车上的钢不能付它自己的费用。', '重型火车和管道为什么不能随便用？怎么解锁？'],
  ['别人用我的管道，我也拿钱', '不管是谁在出售，每桶油流过你的管道，你都立刻拿这条管道的奖励。储备管道只给油田加 1 桶油，谁都不能经它运油，以后你可以换掉它。', '别人用我的管道运油，我有收益吗？储备管道是什么？'],
  ['出售时的商人', '每块要卖的产业，都要连通到至少一个画着它图标的{商人|merchant}。你卖给的、连通的、正面朝上的商人，每个都给一次奖励，然后翻面。', '哪些工业能出售？出售需要什么条件？'],
  ['品质奖励一次只能拿一个', '一次出售的{品质星|star}加起来（每瓶威士忌再加一颗），够数就能拿一个{品质奖励|qreward}，每次出售最多一个。威士忌每人最多存 3 瓶，多的作废。', '品质奖励怎么领取？一次出售能领几个？'],
  ['第一时代结束，什么留下', '轻型火车计分后拿回，第二时代可以再建；重型火车和管道留在地图上。一级产业不管翻没翻面都移走；更高等级、已翻面的产业留着，第二时代结束还会再算一次分。', '第1时代建的工业到第2时代还会再计分吗？'],
  ['平局和 2 人局', '平局先比收入轨上的位置，再比现金。2 人局用印着 2 人图标的地图面，移除没有对应人数图标的牌，再把产 3 桶油的油田和奖励 15 元的商人放回盒子。', '2人局有哪些不同？']
];

// Icon guide, grouped the way things sit on the table.
const GROUPS = [
  ['分数和钱', ['vp', 'link', 'money', 'income']],
  ['时代和等级', ['era1', 'era2', 'level', 'upgrade']],
  ['资源', ['coal', 'iron', 'steel', 'coke', 'oil']],
  ['产业板块', ['tile', 'flip', 'reward', 'oilreq', 'star', 'qreward']],
  ['火车和管道', ['light', 'heavy', 'pipe']],
  ['版图', ['order', 'location', 'market', 'merchant', 'oilfield', 'vanderbilt']],
  ['产业种类', ['kerosene', 'manuf', 'auto', 'coalmine', 'cokeoven', 'ironsteel']],
  ['皇冠明珠产业', ['oilcity', 'loco', 'polyphase', 'skyscraper']],
  ['其他', ['whiskey']]
];

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const term = (text, id) => `<button type="button" class="term" data-t="${id}">${ICON(TERMS[id].icon)}${esc(text)}</button>`;
const line = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\{([^|}]+)\|(\w+)\}/g, (_, t, id) => term(t, id));
// inside a button the terms show their icon but are not buttons themselves
const label = s => esc(s).replace(/\{([^|}]+)\|(\w+)\}/g, (_, t, id) => `<span class="tlab">${ICON(TERMS[id].icon)}${esc(t)}</span>`);
const askBtn = (text, q) => `<button type="button" class="tq" data-q="${esc(q)}">问 <span>${label(text)}</span></button>`;

document.getElementById('teach').innerHTML = `
  <p class="tlead">讲的人先照着念主流程（三四分钟），再一条条过注意事项。<b>带下划线的词</b>点一下看图和解释；有疑问点「问」，规则助手马上回答。</p>
  <nav class="tnav">${PARTS.map((p, i) => `<a href="#p${i + 1}"><i>${i + 1}</i>${p.title}</a>`).join('')}<a href="#later">注意事项</a><a href="#icons">图标速查</a></nav>
  ${PARTS.map((p, i) => `<section class="card tpart" id="p${i + 1}">
    <h2 class="h"><span><i>${i + 1}</i>${p.title}</span><small>约 ${p.sec} 秒</small></h2>
    ${p.lines.map(s => `<p class="tline">${line(s)}</p>`).join('')}
    <div class="tasks"><em>桌上常见疑问</em>${p.ask.map(q => askBtn(q, q)).join('')}</div>
  </section>`).join('')}
  <section class="card tpart" id="later">
    <h2 class="h"><span><i>✓</i>注意事项</span><small>${NOTES.length} 条</small></h2>
    <p class="tnote">流程讲完后，一条一条过一遍。都是规则书里写了、但最容易漏掉或吵起来的地方。点开就是答案。</p>
    <div class="tnotes">${NOTES.map(([t, a, q], i) => `<details class="tni"><summary><i>${i + 1}</i>${esc(t)}</summary><p>${line(a)}</p>${askBtn('还有疑问？问规则助手', q)}</details>`).join('')}</div>
    <p class="tnote">注意事项里没有的，点右下角「规则」问 AI，本站资料查不到会联网找。</p>
  </section>
  <a class="btn tgo" href="/">讲完了，去建房间</a>
  <h2 class="h" id="icons">图标速查<small>点图标看解释</small></h2>
  ${GROUPS.map(([g, ids]) => `<div class="card tgrid"><h3>${g}</h3><div>${ids.map(id => `<button type="button" class="tic" data-t="${id}">${ICON(TERMS[id].icon)}<span>${TERMS[id].name}</span></button>`).join('')}</div></div>`).join('')}
  <footer>依据官方规则书 v2026.01 · 图片截自 Roxley 官方规则书（<a href="https://roxley.com/brass-pittsburgh-rulebook" target="_blank" rel="noopener">原文</a>），版权归 Roxley Games 所有 · 非官方玩家工具</footer>`;

// The note for a term: a sheet from the bottom with the icon, where it is and what it means.
const sheet = document.createElement('div');
sheet.className = 'tsheet hidden';
document.body.appendChild(sheet);
const close = () => sheet.classList.add('hidden');
function show(id) {
  const t = TERMS[id];
  sheet.innerHTML = `<div class="tsbg"></div><div class="tsbox" role="dialog" aria-label="${esc(t.name)}">
    <div class="tshd">${ICON(t.icon, 'big')}<b>${esc(t.name)}</b><button type="button" class="tsx" aria-label="关闭">×</button></div>
    <p><em>在哪儿看到</em>${esc(t.where)}</p><p><em>什么意思</em>${esc(t.what)}</p>
    <button type="button" class="btn navy tsask" data-q="${esc(`「${t.name}」是什么，怎么用？`)}">还不懂？问规则助手</button></div>`;
  sheet.classList.remove('hidden');
}
const ask = q => { close(); window.askRules?.(q); };
document.addEventListener('click', e => {
  const t = e.target.closest('[data-t]');
  if (t) return show(t.dataset.t);
  const q = e.target.closest('[data-q]');
  if (q) return ask(q.dataset.q);
  if (e.target.closest('.tsx,.tsbg')) close();
});
addEventListener('keydown', e => { if (e.key === 'Escape') close(); });


