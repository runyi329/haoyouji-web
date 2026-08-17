export type BankBrand = {
  name: string;
  start: string;
  end: string;
  border: string;
  surface: string;
  line: string;
  logo?: string;
  mark: string;
};

const normalizeBankName = (value?: string | null) => String(value || '')
  .replace(/銀/g, '银')
  .replace(/購/g, '购')
  .replace(/廣/g, '广')
  .trim();

const BRANDS: BankBrand[] = [
  { name: '招商银行', start: '#E91631', end: '#B80620', border: '#A8041B', surface: '#FFF4F6', line: '#F6D8DE', logo: '/bank-logos/cmbchina.svg', mark: '招' },
  { name: '工商银行', start: '#D92A35', end: '#A80B18', border: '#950715', surface: '#FFF4F5', line: '#F5D8DB', logo: '/bank-logos/icbc.svg', mark: '工' },
  { name: '建设银行', start: '#167ABD', end: '#07528D', border: '#064577', surface: '#F1F8FE', line: '#D6EAF9', logo: '/bank-logos/ccb.svg', mark: '建' },
  { name: '农业银行', start: '#2B9C7C', end: '#087152', border: '#075C43', surface: '#F1FBF7', line: '#D3F0E3', logo: '/bank-logos/abchina.svg', mark: '农' },
  { name: '中国银行', start: '#B91F38', end: '#860D25', border: '#70091E', surface: '#FFF3F5', line: '#F3D8DE', logo: '/bank-logos/boc.svg', mark: '中' },
  { name: '交通银行', start: '#135FA9', end: '#003F80', border: '#003567', surface: '#F1F7FE', line: '#D5E6F8', logo: '/bank-logos/bankcomm.svg', mark: '交' },
  { name: '邮储银行', start: '#1C9871', end: '#006B48', border: '#00583C', surface: '#F0FBF6', line: '#D0EDDF', logo: '/bank-logos/psbc.svg', mark: '邮' },
  { name: '浦发银行', start: '#1D5FA8', end: '#053B7D', border: '#003267', surface: '#F1F6FE', line: '#D4E3F7', logo: '/bank-logos/spdb.svg', mark: '浦' },
  { name: '民生银行', start: '#1E6BAA', end: '#084B86', border: '#063F71', surface: '#F1F7FE', line: '#D4E6F8', logo: '/bank-logos/cmbc.svg', mark: '民' },
  { name: '平安银行', start: '#FB7D1B', end: '#D75208', border: '#B94605', surface: '#FFF7F0', line: '#F9E1CD', logo: '/bank-logos/pingan.svg', mark: '平' },
  { name: '兴业银行', start: '#197A61', end: '#00563E', border: '#004833', surface: '#F1FAF6', line: '#D3ECDD', logo: '/bank-logos/cib.svg', mark: '兴' },
  { name: '中信银行', start: '#C82A39', end: '#970E20', border: '#7D0919', surface: '#FFF3F4', line: '#F1D6DA', logo: '/bank-logos/citicbank.svg', mark: '信' },
  { name: '光大银行', start: '#C62755', end: '#8F0E36', border: '#760A2C', surface: '#FFF3F7', line: '#F3D5E2', logo: '/bank-logos/cebbank.svg', mark: '光' },
  { name: '华夏银行', start: '#D22A31', end: '#9A1018', border: '#800A12', surface: '#FFF4F4', line: '#F3D8D8', logo: '/bank-logos/hxb.svg', mark: '华' },
  { name: '广发银行', start: '#D6232C', end: '#A80712', border: '#8B050E', surface: '#FFF3F4', line: '#F4D8DA', logo: '/bank-logos/cgbchina.svg', mark: '广' },
  { name: '浙商银行', start: '#B92B3D', end: '#861326', border: '#6F0E1F', surface: '#FFF4F5', line: '#F0D9DE', mark: '浙' },
  { name: '上海银行', start: '#D74644', end: '#A91824', border: '#8D121C', surface: '#FFF4F4', line: '#F4DADD', mark: '上' },
  { name: '北京银行', start: '#C52B3A', end: '#941223', border: '#7A0D1C', surface: '#FFF4F5', line: '#F1D8DE', mark: '北' },
  { name: '宁波银行', start: '#177FC3', end: '#075A9D', border: '#034B84', surface: '#F1F8FE', line: '#D7EAF9', logo: '/bank-logos/nbcb.svg', mark: '宁' },
  { name: '南京银行', start: '#D72C3B', end: '#9B1022', border: '#800B1B', surface: '#FFF4F5', line: '#F2D8DD', logo: '/bank-logos/njcb.svg', mark: '南' },
  { name: '江苏银行', start: '#217CB9', end: '#07528E', border: '#064677', surface: '#F1F8FE', line: '#D5E9F8', logo: '/bank-logos/jsbchina.svg', mark: '苏' },
  { name: '广州银行', start: '#C72E35', end: '#97111B', border: '#7E0C15', surface: '#FFF4F4', line: '#F2D8D9', logo: '/bank-logos/gzcb.svg', mark: '广' },
  { name: '长沙银行', start: '#B72A3A', end: '#831124', border: '#6B0D1D', surface: '#FFF4F5', line: '#F0D9DE', mark: '长' },
  { name: '成都银行', start: '#D53639', end: '#A3111C', border: '#860D17', surface: '#FFF4F4', line: '#F2D9D9', logo: '/bank-logos/bocd.svg', mark: '成' },
  { name: '汉口银行', start: '#CF3437', end: '#9A111A', border: '#7F0C14', surface: '#FFF4F4', line: '#F2D8D9', logo: '/bank-logos/hkbchina.svg', mark: '汉' },
  { name: '中原银行', start: '#175C99', end: '#0B3D73', border: '#083461', surface: '#F1F6FC', line: '#D7E4F3', mark: '中' },
  { name: '汇丰银行', start: '#DB0011', end: '#A6000D', border: '#8A000B', surface: '#FFF3F4', line: '#F3D7D9', logo: '/bank-logos/hsbc.svg', mark: '汇' },
  { name: '微众银行', start: '#1A9AD6', end: '#0672AE', border: '#055F92', surface: '#F0FAFE', line: '#D2EDF8', mark: '微' },
  { name: '渐丰银行', start: '#2370BA', end: '#0A4B8F', border: '#083F77', surface: '#F1F7FE', line: '#D5E6F8', mark: '渐' },
  { name: '花旗银行', start: '#2676BD', end: '#084F94', border: '#06427B', surface: '#F1F7FE', line: '#D4E7F8', logo: '/bank-logos/citibank.svg', mark: '花' },
];

const DEFAULT_BRAND: BankBrand = {
  name: '其他银行',
  start: '#526781',
  end: '#31445D',
  border: '#293B52',
  surface: '#F4F7FA',
  line: '#DCE4EC',
  mark: '银',
};

export function getBankBrand(bankName?: string | null): BankBrand {
  const normalized = normalizeBankName(bankName);
  return BRANDS.find((brand) => normalized.includes(brand.name)) || DEFAULT_BRAND;
}

export function normalizeDisplayBankName(bankName?: string | null): string {
  return normalizeBankName(bankName) || '其他银行';
}
