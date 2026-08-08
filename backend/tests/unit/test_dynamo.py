import boto3

from auction_common.dynamo import ddb, table


def test_table_caches_handles_without_calling_aws_network(monkeypatch):
    calls = {"resource": 0, "table": []}

    class FakeResource:
        def Table(self, name):
            calls["table"].append(name)
            return {"name": name}

    def fake_resource(service_name):
        calls["resource"] += 1
        assert service_name == "dynamodb"
        return FakeResource()

    ddb.cache_clear()
    table.cache_clear()
    monkeypatch.setattr(boto3, "resource", fake_resource)

    first = table("state")
    second = table("state")
    other = table("events")

    assert first is second
    assert first["name"] == "state"
    assert other["name"] == "events"
    assert calls["resource"] == 1
    assert calls["table"] == ["state", "events"]
