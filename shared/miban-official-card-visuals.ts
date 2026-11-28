export type MibanOfficialCardVisual = {
  image: string;
  sourceImage: string;
  sourceUrl: string;
  crop: [number, number, number, number];
  background: string;
  blend?: "multiply";
};

/** Only list-card photography: no changes to official detail posters or claims. */
export const mibanOfficialCardVisuals: Record<string, MibanOfficialCardVisual> = {
  "nuskin-official-1": {
    image: "/miban-official/nuskin/list-v2/retinol-atmosphere.webp",
    sourceImage: "/miban-official/nuskin/hero-official-full-cover.webp",
    sourceUrl: "https://img.cn.nuskin.com/supplychain-prod/undefined/6X4HW6iEpZ.jpg",
    crop: [98, 405, 658, 1105],
    background: "#DCE7EF",
  },
  "nuskin-official-2": {
    image: "/miban-official/nuskin/list-v2/toner-atmosphere.webp",
    sourceImage: "/miban-official/nuskin/nuskin-official-2/nuskin-official-2-cover.webp",
    sourceUrl: "https://img.cn.nuskin.com/supplychain-prod/undefined/rZzEdwFjmw.jpg",
    crop: [134, 360, 966, 1400],
    background: "#ECF4F9",
  },
  "nuskin-official-3": {
    image: "/miban-official/nuskin/list-v2/vitamin-c-atmosphere.webp",
    sourceImage: "/miban-official/nuskin/nuskin-official-3/nuskin3-cover.webp",
    sourceUrl: "https://img.cn.nuskin.com/supplychain-prod/undefined/R7eJQEAPKa.jpg",
    crop: [440, 620, 1280, 1670],
    background: "#FFF0B9",
  },
  "nuskin-official-4": {
    image: "/miban-official/nuskin/list-v2/blemish-water-atmosphere.webp",
    sourceImage: "/miban-official/nuskin/nuskin-official-4/original-0af32a74d218.jpg",
    sourceUrl: "https://img.cn.nuskin.com/supplychain-prod/release/F4SyCsmMXn.jpg",
    crop: [500, 60, 4020, 4460],
    background: "#D9EEF3",
  },
  "nuskin-official-5": {
    image: "/miban-official/nuskin/list-v2/lip-balm-atmosphere.webp",
    sourceImage: "/miban-official/nuskin/nuskin-official-5/original-fcce320ded57.jpg",
    sourceUrl: "https://china.nuskin.com/content/dam/ns-zh/images/product/cn/supplychain-prod/release/Bf37GXCttx.jpg",
    crop: [390, 185, 1990, 2185],
    background: "#FFF0DC",
    blend: "multiply",
  },




  // BEGIN MARYKAY AMWAY IMMERSIVE V5
  "marykay-official-1": {
    "image": "/miban-official/marykay/marykay-official-1/list-v2/atmosphere.webp",
    "sourceImage": "/miban-official/marykay/marykay-official-1/original-e74087dae5d0.jpg",
    "sourceUrl": "https://community-s3-website.marykay.com.cn/mybizcn/PROD/ProductResource/20250326171438_805.jpg",
    "crop": [
      290,
      286,
      990,
      1161
    ],
    "background": "#0F0210"
  },
  "marykay-official-2": {
    "image": "/miban-official/marykay/marykay-official-2/list-v2/atmosphere.webp",
    "sourceImage": "/miban-official/marykay/marykay-official-2/original-5154b9ce0d34.jpg",
    "sourceUrl": "https://community-s3.marykay.com.cn/PROD/MyBizIntouch_Content_Cms/ProductResource/20230711153909_529.jpg",
    "crop": [
      339,
      220,
      939,
      970
    ],
    "background": "#31154F"
  },
  "marykay-official-3": {
    "image": "/miban-official/marykay/marykay-official-3/list-v2/atmosphere.webp",
    "sourceImage": "/miban-official/marykay/marykay-official-3/mobile-3e3212c1b6f2.webp",
    "sourceUrl": "https://community-s3.marykay.com.cn/PROD/MyBizIntouch_Content_Cms/ProductResource/20230822143338_917.jpg",
    "crop": [
      76,
      200,
      676,
      950
    ],
    "background": "#4C395A"
  },
  "marykay-official-4": {
    "image": "/miban-official/marykay/marykay-official-4/list-v2/atmosphere.webp",
    "sourceImage": "/miban-official/marykay/marykay-official-4/mobile-afb223795b2b.webp",
    "sourceUrl": "https://community-s3-website.marykay.com.cn/mybizcn/PROD/ProductResource/20250624154605_662.jpg",
    "crop": [
      87,
      400,
      663,
      1120
    ],
    "background": "#CCC6D4"
  },
  "marykay-official-5": {
    "image": "/miban-official/marykay/marykay-official-5/list-v2/atmosphere.webp",
    "sourceImage": "/miban-official/marykay/marykay-official-5/mobile-b6bcd7ab518d.webp",
    "sourceUrl": "https://community-s3.marykay.com.cn/PROD/MyBizIntouch_Content_Cms/ProductResource/20230822141135_72.jpg",
    "crop": [
      5,
      175,
      745,
      1100
    ],
    "background": "#6B4E86"
  },
  "amway-official-1": {
    "image": "/miban-official/amway/amway-official-1/list-v2/atmosphere.webp",
    "sourceImage": "/miban-official/amway/amway-official-1/original-f50934555ac9.jpg",
    "sourceUrl": "https://cc-cdn.amway.com.cn/ContentCenter/prod/assets/2023-05-08/20230508163504bx3yp3SmM4HeHe6XhfRKzXbXbYz3mhbN.jpg",
    "crop": [
      3,
      505,
      747,
      1435
    ],
    "background": "#E6F3FB"
  },
  "amway-official-2": {
    "image": "/miban-official/amway/amway-official-2/list-v2/atmosphere.webp",
    "sourceImage": "/miban-official/amway/amway-official-2/original-2a9ca9f5561d.jpg",
    "sourceUrl": "https://resources.amway.com.cn/product/1735611780640/12.27雅蜜身体乳详情页_01.jpg",
    "crop": [
      0,
      590,
      1100,
      1965
    ],
    "background": "#091603"
  },
  "amway-official-3": {
    "image": "/miban-official/amway/amway-official-3/list-v2/atmosphere.webp",
    "sourceImage": "/miban-official/amway/amway-official-3/original-ceae38778350.jpg",
    "sourceUrl": "https://cc-cdn.amway.com.cn/ContentCenter/prod/assets/2026-06-25/20260625142405DhxchfhtAQAYAWRpZAHx7aDeGXHDWjA5.jpg",
    "crop": [
      75,
      0,
      1075,
      1250
    ],
    "background": "#F5FAFD"
  },
  "amway-official-4": {
    "image": "/miban-official/amway/amway-official-4/list-v2/atmosphere.webp",
    "sourceImage": "/miban-official/amway/amway-official-4/original-44a432075324.jpg",
    "sourceUrl": "https://resources.amway.com.cn/product/1769578267609/11_%E7%9C%8B%E5%9B%BE%E7%8E%8B.jpg",
    "crop": [
      202,
      400,
      906,
      1280
    ],
    "background": "#FDFCF7"
  },
  "amway-official-5": {
    "image": "/miban-official/amway/amway-official-5/list-v2/atmosphere.webp",
    "sourceImage": "/miban-official/amway/amway-official-5/original-26450e225d2e.png",
    "sourceUrl": "https://cc-cdn.amway.com.cn/ContentCenter/prod/assets/2023-12-08/20231208215905GH3WKK44pP7p6bSRTdA3wXNEMRFs48pp.jpg",
    "crop": [
      376,
      1010,
      944,
      1720
    ],
    "background": "#2D4818"
  },
  // END MARYKAY AMWAY IMMERSIVE V5

};

export const getMibanOfficialCardVisual = (key: string) => mibanOfficialCardVisuals[key];
