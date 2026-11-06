import json
import os

base_dir = os.path.dirname(os.path.abspath(__file__))
preview_dir = os.path.join(base_dir, 'preview_models')
output_json = os.path.join(base_dir, 'preview_models.json')

if not os.path.exists(preview_dir):
    os.makedirs(preview_dir)
    print("📁 自动创建了 preview_models 文件夹")

# 💡 核心升级：读取旧 JSON，保护用户已写的标题和描述不被覆盖
old_data = {}
if os.path.exists(output_json):
    try:
        with open(output_json, 'r', encoding='utf-8') as f:
            old_list = json.load(f)
            for item in old_list:
                if isinstance(item, dict) and 'url' in item:
                    old_data[item['url']] = item
    except:
        pass

new_list = []
print("🔍 开始扫描 3D 模型画廊...")

for root, dirs, files in os.walk(preview_dir):
    for f in files:
        if f.lower().endswith('.glb'):
            rel_path = os.path.relpath(os.path.join(root, f), base_dir).replace('\\', '/')

            # 如果是旧模型，保留原有的信息；如果是新模型，生成默认信息
            if rel_path in old_data:
                new_list.append(old_data[rel_path])
            else:
                default_title = os.path.splitext(f)[0].replace('_', ' ').title()
                new_list.append({
                    "url": rel_path,
                    "title": default_title,
                    "desc": "This is a new model. Please edit this description in preview_models.json."
                })

with open(output_json, 'w', encoding='utf-8') as f:
    json.dump(new_list, f, ensure_ascii=False, indent=4)

print(f"✅ 画廊扫描结束！共更新 {len(new_list)} 个模型的图鉴信息。")