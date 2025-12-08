#!/usr/bin/env python3
"""測試後端 API 功能"""
import requests
from dotenv import load_dotenv

load_dotenv()

BASE_URL = "http://localhost:8000"

def test_session_create():
    """測試建立 session"""
    print("=" * 50)
    print("測試 1: 建立 Session")
    print("=" * 50)
    
    response = requests.post(
        f"{BASE_URL}/api/session/create",
        json={},
        timeout=10
    )
    
    if response.status_code == 200:
        data = response.json()
        print("✓ Session 建立成功")
        print(f"  Session ID: {data['session_id']}")
        print(f"  Store Name: {data['file_search_store_name']}")
        return data['session_id']
    else:
        print(f"✗ Session 建立失敗: {response.status_code}")
        print(f"  錯誤: {response.text}")
        return None

def test_upload_file(session_id):
    """測試上傳檔案"""
    print("\n" + "=" * 50)
    print("測試 2: 上傳檔案")
    print("=" * 50)
    
    if not session_id:
        print("✗ 跳過：沒有有效的 session_id")
        return False
    
    # 建立一個測試檔案
    test_content = "這是一個測試檔案內容。\nThis is a test file content.".encode('utf-8')
    test_file = ("test.txt", test_content, "text/plain")
    
    form_data = {
        'session_id': session_id,
        'display_name': 'test-file'
    }
    files = {
        'file': test_file
    }
    
    response = requests.post(
        f"{BASE_URL}/api/upload/file",
        data=form_data,
        files=files,
        timeout=30
    )
    
    if response.status_code == 200:
        data = response.json()
        print("✓ 檔案上傳成功")
        print(f"  檔案名稱: {data['file_name']}")
        return True
    else:
        print(f"✗ 檔案上傳失敗: {response.status_code}")
        print(f"  錯誤: {response.text}")
        return False

def test_chat(session_id):
    """測試對話功能"""
    print("\n" + "=" * 50)
    print("測試 3: 對話功能")
    print("=" * 50)
    
    if not session_id:
        print("✗ 跳過：沒有有效的 session_id")
        return False
    
    response = requests.post(
        f"{BASE_URL}/api/chat/message",
        json={
            "session_id": session_id,
            "message": "這是一個測試問題"
        },
        timeout=30
    )
    
    if response.status_code == 200:
        data = response.json()
        print("✓ 對話成功")
        print(f"  回應: {data['response'][:100]}...")
        if data.get('grounding_metadata'):
            print("  有引用資訊")
        return True
    else:
        print(f"✗ 對話失敗: {response.status_code}")
        print(f"  錯誤: {response.text}")
        return False

def test_delete_session(session_id):
    """測試刪除 session"""
    print("\n" + "=" * 50)
    print("測試 4: 刪除 Session")
    print("=" * 50)
    
    if not session_id:
        print("✗ 跳過：沒有有效的 session_id")
        return False
    
    response = requests.delete(f"{BASE_URL}/api/session/{session_id}", timeout=10)
    
    if response.status_code == 200:
        print("✓ Session 刪除成功")
        return True
    else:
        print(f"✗ Session 刪除失敗: {response.status_code}")
        print(f"  錯誤: {response.text}")
        return False

def main():
    print("開始測試後端 API...")
    print(f"後端 URL: {BASE_URL}\n")
    
    # 測試健康檢查
    try:
        health = requests.get(f"{BASE_URL}/health", timeout=5)
        if health.status_code == 200:
            print("✓ 後端服務正常運行\n")
        else:
            print("✗ 後端服務異常\n")
            return
    except requests.exceptions.ConnectionError:
        print("✗ 無法連接到後端服務")
        print("  請確認後端是否正在運行: python backend/main.py")
        return
    
    # 執行測試
    session_id = test_session_create()
    if session_id:
        test_upload_file(session_id)
        # 等待一下讓檔案處理完成
        import time
        print("\n等待 5 秒讓檔案處理完成...")
        time.sleep(5)
        test_chat(session_id)
        test_delete_session(session_id)
    
    print("\n" + "=" * 50)
    print("測試完成")
    print("=" * 50)

if __name__ == "__main__":
    main()

