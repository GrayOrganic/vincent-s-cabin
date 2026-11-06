const fs = require('fs');
const path = require('path');

// 读取你的 data.json
const jsonPath = path.join(__dirname, 'data.json');
let projectsData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

projectsData.forEach(project => {
    // 寻找对应项目 id 的文件夹，比如 videos/cart_1
    const folderPath = path.join(__dirname, 'videos', project.id);

    if (fs.existsSync(folderPath)) {
        // 读取文件夹里的所有文件，并过滤掉隐藏文件（如 macOS 的 .DS_Store）
        const files = fs.readdirSync(folderPath).filter(file => !file.startsWith('.'));

        if (files.length > 0) {
            // 如果只有一个文件，就存成字符串；如果有多个，就存成数组
            if (files.length === 1) {
                project.screenMedia = `videos/${project.id}/${files[0]}`;
            } else {
                project.screenMedia = files.map(file => `videos/${project.id}/${file}`);
            }
        }
    }
});

// 把更新后的数据写回 data.json
fs.writeFileSync(jsonPath, JSON.stringify(projectsData, null, 4), 'utf8');
console.log('✅ 媒体文件扫描完成！已自动将真实文件名更新入 data.json！');