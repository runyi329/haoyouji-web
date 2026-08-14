/**
 * 用户身份展示与搜索工具。
 *
 * 全站约定：用户搜索同时匹配账本昵称、账户昵称、用户名和外部用户标识；
 * 任意连续片段均可命中。展示时优先使用账本昵称，其次账户昵称，最后使用用户名。
 */
export type SearchableUserIdentity = {
  nickname?: string | null;
  name?: string | null;
  username?: string | null;
  userName?: string | null;
  displayName?: string | null;
  wecom_user_id?: string | null;
  userid?: string | null;
};

const normalize = (value: unknown) => String(value ?? "").trim();

export function getUserDisplayName(user?: SearchableUserIdentity | null, fallback = "") {
  if (!user) return fallback;
  return normalize(user.nickname) || normalize(user.name) || normalize(user.displayName) || normalize(user.username) || normalize(user.userName) || fallback;
}

export function getUserSearchText(user?: SearchableUserIdentity | null) {
  if (!user) return "";
  return [
    user.nickname,
    user.name,
    user.username,
    user.userName,
    user.displayName,
    user.wecom_user_id,
    user.userid,
  ]
    .map(normalize)
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase();
}

/** 支持用户名、昵称与任意连续片段的大小写不敏感匹配。 */
export function matchesUserSearch(user: SearchableUserIdentity | null | undefined, query: string) {
  const normalizedQuery = normalize(query).toLocaleLowerCase();
  return !normalizedQuery || getUserSearchText(user).includes(normalizedQuery);
}

/** 在候选列表中保留昵称主显示，同时在用户名不同时展示辅助用户名。 */
export function getUserSearchLabel(user?: SearchableUserIdentity | null, fallback = "") {
  const displayName = getUserDisplayName(user, fallback);
  const username = normalize(user?.username) || normalize(user?.userName);
  return username && username !== displayName ? `${displayName}（${username}）` : displayName;
}
