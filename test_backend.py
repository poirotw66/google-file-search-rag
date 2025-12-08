#!/usr/bin/env python3
"""簡單的後端測試腳本"""
import requests
import json

BASE_URL = "http://localhost:8000"

def test_backend():
    print("測試後端服務...")
    
    # 測試健康檢查
    try:
        response = requests.get(f"{BASE_URL}/health", timeout=5)
        print(f"✓ 健康檢查: {response.status_code} - {response.json()}")
    except requests.exceptions.ConnectionError:
        print("✗ 無法連接到後端服務")
        print("  請確認後端是否正在運行: python backend/main.py")
        return False
    except Exception as e:
        print(f"✗ 健康檢查失敗: {e}")
        return False
    
    # 測試建立 session
    try:
        response = requests.post(
            f"{BASE_URL}/api/session/create",
            json={},
            timeout=10
        )
        if response.status_code == 200:
            data = response.json()
            print(f"✓ 建立 session 成功: {data['session_id']}")
            session_id = data['session_id']
            
            # 測試取得 session
            response = requests.get(f"{BASE_URL}/api/session/{session_id}", timeout=5)
            if response.status_code == 200:
                print(f"✓ 取得 session 成功")
            
            # 清理
            requests.delete(f"{BASE_URL}/api/session/{session_id}", timeout=5)
            print("✓ 測試完成")
            return True
        else:
            print(f"✗ 建立 session 失敗: {response.status_code} - {response.text}")
            return False
    except Exception as e:
        print(f"✗ 建立 session 失敗: {e}")
        return False

if __name__ == "__main__":
    test_backend()

