import { http } from './request.js'

/** 账号资料与「我的」四类列表。字段与 server/src/routes/users.js 对齐。 */
export function updateProfile({ nickname, avatarUrl = null }) {
  return http.patch('/api/users/me', { nickname, avatarUrl })
}

export function myRecipes(page = 1, pageSize = 20) {
  return http.get('/api/users/me/recipes', { page, pageSize })
}

export function myFavorites(page = 1, pageSize = 20) {
  return http.get('/api/users/me/favorites', { page, pageSize })
}

export function myRatings(page = 1, pageSize = 20) {
  return http.get('/api/users/me/ratings', { page, pageSize })
}

export default { updateProfile, myRecipes, myFavorites, myRatings }
