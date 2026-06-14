/**
 * 牙伴齿科 - 内置中国省/市/区行政区划数据（精简版）
 * 说明：门店位于上海，故上海做到「区」级齐全；其余省市覆盖主要城市与市辖区，
 * 满足绝大多数顾客的省市区选择。无需联网，纯前端级联。
 */

export interface RegionNode {
  name: string;
  children?: RegionNode[];
}

export const CHINA_REGION: RegionNode[] = [
  {
    name: "上海市",
    children: [
      { name: "黄浦区" }, { name: "徐汇区" }, { name: "长宁区" }, { name: "静安区" },
      { name: "普陀区" }, { name: "虹口区" }, { name: "杨浦区" }, { name: "浦东新区" },
      { name: "闵行区" }, { name: "宝山区" }, { name: "嘉定区" }, { name: "金山区" },
      { name: "松江区" }, { name: "青浦区" }, { name: "奉贤区" }, { name: "崇明区" },
    ],
  },
  {
    name: "北京市",
    children: [
      { name: "东城区" }, { name: "西城区" }, { name: "朝阳区" }, { name: "海淀区" },
      { name: "丰台区" }, { name: "石景山区" }, { name: "门头沟区" }, { name: "房山区" },
      { name: "通州区" }, { name: "顺义区" }, { name: "昌平区" }, { name: "大兴区" },
      { name: "怀柔区" }, { name: "平谷区" }, { name: "密云区" }, { name: "延庆区" },
    ],
  },
  {
    name: "天津市",
    children: [
      { name: "和平区" }, { name: "河东区" }, { name: "河西区" }, { name: "南开区" },
      { name: "河北区" }, { name: "红桥区" }, { name: "东丽区" }, { name: "西青区" },
      { name: "津南区" }, { name: "北辰区" }, { name: "武清区" }, { name: "宝坻区" },
      { name: "滨海新区" }, { name: "宁河区" }, { name: "静海区" }, { name: "蓟州区" },
    ],
  },
  {
    name: "重庆市",
    children: [
      { name: "渝中区" }, { name: "江北区" }, { name: "南岸区" }, { name: "九龙坡区" },
      { name: "沙坪坝区" }, { name: "渝北区" }, { name: "巴南区" }, { name: "北碚区" },
      { name: "大渡口区" }, { name: "万州区" }, { name: "涪陵区" }, { name: "永川区" },
      { name: "合川区" }, { name: "其他区县" },
    ],
  },
  {
    name: "江苏省",
    children: [
      { name: "南京市" }, { name: "苏州市" }, { name: "无锡市" }, { name: "常州市" },
      { name: "镇江市" }, { name: "南通市" }, { name: "扬州市" }, { name: "泰州市" },
      { name: "盐城市" }, { name: "徐州市" }, { name: "淮安市" }, { name: "连云港市" },
      { name: "宿迁市" },
    ],
  },
  {
    name: "浙江省",
    children: [
      { name: "杭州市" }, { name: "宁波市" }, { name: "温州市" }, { name: "嘉兴市" },
      { name: "湖州市" }, { name: "绍兴市" }, { name: "金华市" }, { name: "衢州市" },
      { name: "舟山市" }, { name: "台州市" }, { name: "丽水市" },
    ],
  },
  {
    name: "广东省",
    children: [
      { name: "广州市" }, { name: "深圳市" }, { name: "珠海市" }, { name: "佛山市" },
      { name: "东莞市" }, { name: "中山市" }, { name: "惠州市" }, { name: "江门市" },
      { name: "汕头市" }, { name: "湛江市" }, { name: "肇庆市" }, { name: "茂名市" },
      { name: "其他" },
    ],
  },
  {
    name: "安徽省",
    children: [
      { name: "合肥市" }, { name: "芜湖市" }, { name: "蚌埠市" }, { name: "马鞍山市" },
      { name: "安庆市" }, { name: "滁州市" }, { name: "阜阳市" }, { name: "黄山市" },
      { name: "其他" },
    ],
  },
  {
    name: "山东省",
    children: [
      { name: "济南市" }, { name: "青岛市" }, { name: "烟台市" }, { name: "潍坊市" },
      { name: "临沂市" }, { name: "淄博市" }, { name: "济宁市" }, { name: "威海市" },
      { name: "其他" },
    ],
  },
  {
    name: "河南省",
    children: [
      { name: "郑州市" }, { name: "洛阳市" }, { name: "开封市" }, { name: "南阳市" },
      { name: "新乡市" }, { name: "许昌市" }, { name: "其他" },
    ],
  },
  {
    name: "河北省",
    children: [
      { name: "石家庄市" }, { name: "唐山市" }, { name: "保定市" }, { name: "廊坊市" },
      { name: "邯郸市" }, { name: "沧州市" }, { name: "秦皇岛市" }, { name: "其他" },
    ],
  },
  {
    name: "湖北省",
    children: [
      { name: "武汉市" }, { name: "宜昌市" }, { name: "襄阳市" }, { name: "黄石市" },
      { name: "荆州市" }, { name: "其他" },
    ],
  },
  {
    name: "湖南省",
    children: [
      { name: "长沙市" }, { name: "株洲市" }, { name: "湘潭市" }, { name: "衡阳市" },
      { name: "岳阳市" }, { name: "常德市" }, { name: "其他" },
    ],
  },
  {
    name: "四川省",
    children: [
      { name: "成都市" }, { name: "绵阳市" }, { name: "德阳市" }, { name: "南充市" },
      { name: "宜宾市" }, { name: "泸州市" }, { name: "其他" },
    ],
  },
  {
    name: "福建省",
    children: [
      { name: "福州市" }, { name: "厦门市" }, { name: "泉州市" }, { name: "漳州市" },
      { name: "莆田市" }, { name: "其他" },
    ],
  },
  {
    name: "江西省",
    children: [
      { name: "南昌市" }, { name: "赣州市" }, { name: "九江市" }, { name: "上饶市" },
      { name: "其他" },
    ],
  },
  {
    name: "辽宁省",
    children: [
      { name: "沈阳市" }, { name: "大连市" }, { name: "鞍山市" }, { name: "锦州市" },
      { name: "其他" },
    ],
  },
  {
    name: "陕西省",
    children: [
      { name: "西安市" }, { name: "宝鸡市" }, { name: "咸阳市" }, { name: "渭南市" },
      { name: "其他" },
    ],
  },
  { name: "山西省", children: [{ name: "太原市" }, { name: "大同市" }, { name: "其他" }] },
  { name: "云南省", children: [{ name: "昆明市" }, { name: "大理白族自治州" }, { name: "其他" }] },
  { name: "贵州省", children: [{ name: "贵阳市" }, { name: "遵义市" }, { name: "其他" }] },
  { name: "广西壮族自治区", children: [{ name: "南宁市" }, { name: "桂林市" }, { name: "柳州市" }, { name: "其他" }] },
  { name: "黑龙江省", children: [{ name: "哈尔滨市" }, { name: "大庆市" }, { name: "其他" }] },
  { name: "吉林省", children: [{ name: "长春市" }, { name: "吉林市" }, { name: "其他" }] },
  { name: "甘肃省", children: [{ name: "兰州市" }, { name: "其他" }] },
  { name: "海南省", children: [{ name: "海口市" }, { name: "三亚市" }, { name: "其他" }] },
  { name: "内蒙古自治区", children: [{ name: "呼和浩特市" }, { name: "包头市" }, { name: "其他" }] },
  { name: "新疆维吾尔自治区", children: [{ name: "乌鲁木齐市" }, { name: "其他" }] },
  { name: "宁夏回族自治区", children: [{ name: "银川市" }, { name: "其他" }] },
  { name: "青海省", children: [{ name: "西宁市" }, { name: "其他" }] },
  { name: "西藏自治区", children: [{ name: "拉萨市" }, { name: "其他" }] },
  { name: "香港特别行政区" },
  { name: "澳门特别行政区" },
  { name: "台湾省" },
  { name: "海外/其他" },
];
