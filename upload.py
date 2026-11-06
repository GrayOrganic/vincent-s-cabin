import json
import os

# 获取当前脚本所在的绝对路径，并定位 data.json 和 videos 文件夹
base_dir = os.path.dirname(os.path.abspath(__file__))
json_path = os.path.join(base_dir, 'data.json')
videos_dir = os.path.join(base_dir, 'videos')

# 1. 读取现有的 data.json
with open(json_path, 'r', encoding='utf-8') as f:
    projects_data = json.load(f)

# 2. 遍历项目数据，自动扫描文件夹
for project in projects_data:
    project_id = project.get('id')
    if not project_id:
        continue

    folder_path = os.path.join(videos_dir, project_id)

    # 检查对应的 videos/cart_x 文件夹是否存在
    if os.path.exists(folder_path) and os.path.isdir(folder_path):
        # 读取文件夹里所有的文件，并过滤掉 macOS/Windows 的隐藏文件 (如 .DS_Store)
        files = [f for f in os.listdir(folder_path)
                 if not f.startswith('.') and os.path.isfile(os.path.join(folder_path, f))]

        if files:
            # 拼装成前端需要的相对路径格式 (如 "videos/cart_1/xxx.mp4")
            media_paths = [f"videos/{project_id}/{f}" for f in files]

            # 如果只有1个文件，存为字符串；如果是多个文件，存为数组（方便前端轮播）
            if len(media_paths) == 1:
                project['screenMedia'] = media_paths[0]
            else:
                project['screenMedia'] = media_paths

# 3. 把更新后的数据写回 data.json
# ensure_ascii=False 保证中文字符不会变成乱码，indent=4 保证排版整齐
with open(json_path, 'w', encoding='utf-8') as f:
    json.dump(projects_data, f, ensure_ascii=False, indent=4)

print("✅ 媒体文件扫描完成！已自动将真实文件名更新入 data.json！")