# ADR-002｜使用TMDB／JustWatch台灣觀測資料

## 決策
新增`/lab/tw`與`/api/watchpilot/tw/search?q=<電影名稱>`，只對TMDB的`results.TW`做正規化。

## 理由
- TMDB提供電影原始ID、繁體中文內容、片長及各區觀看平台資料。
- 無需自行維護整個台灣電影片庫，適合個人開源研究。
- 視為第三方觀測，不等於官方授權保證；沒有資料不能推斷下架。

## 防護
- v3 API Key僅由Next.js伺服器環境變數取得。
- 查詢限制2至80字且最多5筆結果；每筆呼叫電影詳情與觀看平台API。
- 不允許回退美國或其他地區結果。
- 分辨flatrate／free／ads／rent／buy。
- 廣告、租借及購買預設不納入已訂閱權益的排程。
- 僅HTTPS的TMDB觀看資訊頁可作為外部連結。
- 不傳出API憑證；未設定金鑰時回報503，不影響Fixture。
- 單一片源查詢失敗時顯示缺失，不當成確定不可看。
- Research Mode與Fixture Mode獨立。
- 來源時間超過7天則不排入研究計畫。

## 已知限制
- 搜尋非整庫掃描，不保證平台覆蓋。
- 平台名稱對照只涵蓋已知常用名稱，其他以`tmdb:<id>`保留。
- TMDB不提供作品官方確定下架期限。
- 查詢端點目前針對單人本機使用，**不得直接開放到公網作為無認證代理**。
- 查詢來源、官方片庫交叉驗證與資料契約尚需人工驗收。

## 來源
- https://developer.themoviedb.org/reference/movie-watch-providers
- https://developer.themoviedb.org/docs/faq
- https://www.themoviedb.org/about/logos-attribution
