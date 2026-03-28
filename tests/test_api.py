from __future__ import annotations


def test_admin_can_create_user(client, auth_headers):
    response = client.post(
        "/users",
        headers=auth_headers,
        json={"login": "user", "password": "password123", "is_admin": False},
    )

    assert response.status_code == 201
    assert response.json()["login"] == "user"

    me_response = client.get("/users/me", headers=auth_headers)
    assert me_response.status_code == 200
    assert me_response.json()["login"] == "admin"


def test_empty_workout_cannot_be_created(client, auth_headers):
    response = client.post(
        "/workouts",
        headers=auth_headers,
        json={"date": "2026-03-28", "notes": "Пустая"},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Нельзя сохранить пустую тренировку"


def test_workout_flow_with_template_and_analytics(client, auth_headers):
    exercise_response = client.post("/exercises", headers=auth_headers, json={"name": "Bench Press", "type": "strength"})
    assert exercise_response.status_code == 201
    exercise_id = exercise_response.json()["id"]

    template_response = client.post(
        "/templates",
        headers=auth_headers,
        json={
            "name": "Push Day",
            "exercises": [
                {
                    "exercise_id": exercise_id,
                    "order_index": 1,
                    "planned_sets": 3,
                    "planned_reps": 5,
                }
            ],
        },
    )
    assert template_response.status_code == 201
    template_id = template_response.json()["id"]

    workout_response = client.post(
        "/workouts",
        headers=auth_headers,
        json={
            "date": "2026-03-28",
            "template_id": template_id,
        },
    )
    assert workout_response.status_code == 201
    workout = workout_response.json()
    workout_exercise_id = workout["exercises"][0]["id"]
    assert len(workout["exercises"][0]["sets"]) == 3
    assert workout["exercises"][0]["sets"][0]["reps"] == 5

    first_set_response = client.post(
        f"/workouts/{workout['id']}/sets",
        headers=auth_headers,
        json={"workout_exercise_id": workout_exercise_id, "set_number": 1, "weight": 100, "reps": 5},
    )
    assert first_set_response.status_code == 201

    second_set_response = client.post(
        f"/workouts/{workout['id']}/sets",
        headers=auth_headers,
        json={"workout_exercise_id": workout_exercise_id, "set_number": 2, "weight": 105, "reps": 3},
    )
    assert second_set_response.status_code == 201

    summary_response = client.get(f"/workouts/{workout['id']}/summary", headers=auth_headers)
    assert summary_response.status_code == 200
    assert summary_response.json()["total_tonnage"] == 815.0

    pr_response = client.get(f"/exercises/{exercise_id}/pr", headers=auth_headers)
    assert pr_response.status_code == 200
    assert pr_response.json()["personal_record_weight"] == 105.0

    history_response = client.get(f"/exercises/{exercise_id}/history", headers=auth_headers)
    assert history_response.status_code == 200
    assert len(history_response.json()) == 5
    assert any(item["is_personal_record"] for item in history_response.json())

    latest_response = client.get(f"/exercises/{exercise_id}/latest", headers=auth_headers)
    assert latest_response.status_code == 200
    assert latest_response.json()["weight"] == 105.0

    overview_response = client.get("/analytics/overview?days=30", headers=auth_headers)
    assert overview_response.status_code == 200
    assert overview_response.json()["workouts_count"] == 1
    assert overview_response.json()["total_tonnage"] == 815.0

    assert summary_response.json()["personal_records"][0]["exercise_id"] == exercise_id


def test_set_can_be_created_updated_and_deleted(client, auth_headers):
    exercise_response = client.post("/exercises", headers=auth_headers, json={"name": "Plank", "type": "static"})
    exercise_id = exercise_response.json()["id"]

    workout_response = client.post(
        "/workouts",
        headers=auth_headers,
        json={"date": "2026-03-28", "exercises": [{"exercise_id": exercise_id, "order_index": 1, "sets": []}]},
    )
    workout = workout_response.json()
    workout_exercise_id = workout["exercises"][0]["id"]

    create_response = client.post(
        f"/workouts/{workout['id']}/sets",
        headers=auth_headers,
        json={"workout_exercise_id": workout_exercise_id, "set_number": 1, "duration_seconds": 60},
    )
    assert create_response.status_code == 201
    set_id = create_response.json()["id"]

    update_response = client.put(f"/sets/{set_id}", headers=auth_headers, json={"duration_seconds": 90})
    assert update_response.status_code == 200
    assert update_response.json()["duration_seconds"] == 90

    delete_response = client.delete(f"/sets/{set_id}", headers=auth_headers)
    assert delete_response.status_code == 204


def test_workout_can_be_copied(client, auth_headers):
    exercise_response = client.post("/exercises", headers=auth_headers, json={"name": "Squat", "type": "strength"})
    exercise_id = exercise_response.json()["id"]

    original_response = client.post(
        "/workouts",
        headers=auth_headers,
        json={
            "date": "2026-03-28",
            "notes": "Ноги",
            "exercises": [
                {
                    "exercise_id": exercise_id,
                    "order_index": 1,
                    "sets": [
                        {"set_number": 1, "weight": 120, "reps": 5},
                        {"set_number": 2, "weight": 125, "reps": 3},
                    ],
                }
            ],
        },
    )
    original_id = original_response.json()["id"]

    copied_response = client.post(
        f"/workouts/{original_id}/copy",
        headers=auth_headers,
        json={"date": "2026-03-29", "notes": "Копия"},
    )

    assert copied_response.status_code == 201
    copied = copied_response.json()
    assert copied["date"] == "2026-03-29"
    assert copied["notes"] == "Копия"
    assert copied["exercises"][0]["sets"][0]["weight"] == 120.0


def test_template_can_be_created_from_workout_and_previous_workout_can_be_loaded(client, auth_headers):
    exercise_response = client.post("/exercises", headers=auth_headers, json={"name": "Press", "type": "strength"})
    exercise_id = exercise_response.json()["id"]

    first_workout = client.post(
        "/workouts",
        headers=auth_headers,
        json={
            "date": "2026-03-27",
            "exercises": [
                {
                    "exercise_id": exercise_id,
                    "order_index": 1,
                    "sets": [
                        {"set_number": 1, "weight": 60, "reps": 8},
                        {"set_number": 2, "weight": 65, "reps": 6},
                    ],
                }
            ],
        },
    ).json()

    second_workout = client.post(
        "/workouts",
        headers=auth_headers,
        json={
            "date": "2026-03-28",
            "exercises": [
                {
                    "exercise_id": exercise_id,
                    "order_index": 1,
                    "sets": [
                        {"set_number": 1, "weight": 70, "reps": 5},
                    ],
                }
            ],
        },
    ).json()

    template_response = client.post(
        f"/templates/from-workout/{second_workout['id']}",
        headers=auth_headers,
        json={"name": "Press Template"},
    )
    assert template_response.status_code == 201
    assert template_response.json()["exercises"][0]["planned_sets"] == 1
    assert template_response.json()["exercises"][0]["planned_reps"] == 5

    previous_response = client.get(
        f"/exercises/{exercise_id}/previous?before_workout_id={second_workout['id']}",
        headers=auth_headers,
    )
    assert previous_response.status_code == 200
    assert previous_response.json()["workout_id"] == first_workout["id"]
    assert len(previous_response.json()["sets"]) == 2
    assert previous_response.json()["total_tonnage"] == 870.0
