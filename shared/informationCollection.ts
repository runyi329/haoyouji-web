/**
 * 信息采集属于胡大叔个人的全站观察工具。
 * 入口隐藏并不等于权限控制；服务端接口与页面路由均须使用此身份校验。
 */
export const INFORMATION_COLLECTION_OWNER_USER_ID = 870413;

export function isInformationCollectionOwner(userId: number | null | undefined) {
  return Number(userId) === INFORMATION_COLLECTION_OWNER_USER_ID;
}
