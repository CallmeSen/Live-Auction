from app.domain.events.auction_item_event import AuctionItemEvent


def serialize_auction_item_event(event: AuctionItemEvent) -> dict:
    return event.model_dump(
        mode="json",
        by_alias=True,
    )
