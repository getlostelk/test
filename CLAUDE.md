# Chloe 自我介紹網頁

單頁靜態網站(index.html),清新森林色系。

## 部署

- GitHub repo:https://github.com/getlostelk/test(public)
- GitHub Pages:https://getlostelk.github.io/test/(push 到 main 自動更新)

## Zeabur Deployment
- Project ID: 6a60795c536b84a1337ce78c
- Service ID: 6a60799a536b84a1337ce7ae
- Environment ID: 6a60795cb0b7a4abeb4e6ec8
- 伺服器:Linode Tokyo 1C 2GB 2(server-6a6077c0f3bc28a7cd28ceab)
- 重新部署指令:`npx zeabur@latest deploy --project-id 6a60795c536b84a1337ce78c --service-id 6a60799a536b84a1337ce7ae --json`(必須帶 --service-id,否則會建出重複服務)
