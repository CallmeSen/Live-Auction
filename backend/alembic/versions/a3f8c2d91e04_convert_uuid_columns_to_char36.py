"""convert uuid columns to char36

Revision ID: a3f8c2d91e04
Revises: 4518d1a038f1
Create Date: 2026-07-19 12:05:00.000000

"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a3f8c2d91e04"
down_revision: Union[str, Sequence[str], None] = "4518d1a038f1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

FOREIGN_KEYS = (
    ("auction_items", "fk_auction_items_category"),
    ("auction_items", "fk_auction_items_seller"),
    ("auction_items", "fk_auction_items_session"),
    ("auction_items", "fk_auction_items_winner"),
    ("auction_session_rules", "fk_auction_session_rules_session"),
    ("auction_sessions", "fk_auction_sessions_seller"),
    ("bids", "fk_bids_bidder"),
    ("bids", "fk_bids_item"),
    ("bids", "fk_bids_session"),
    ("item_images", "fk_item_images_item"),
)

UUID_COLUMNS = (
    ("users", "id", False, True),
    ("categories", "id", False, True),
    ("auction_sessions", "id", False, True),
    ("auction_sessions", "seller_id", False, False),
    ("auction_session_rules", "id", False, True),
    ("auction_session_rules", "session_id", False, False),
    ("auction_items", "id", False, True),
    ("auction_items", "seller_id", False, False),
    ("auction_items", "session_id", False, False),
    ("auction_items", "category_id", True, False),
    ("auction_items", "winner_user_id", True, False),
    ("item_images", "id", False, True),
    ("item_images", "item_id", False, False),
    ("bids", "id", False, True),
    ("bids", "item_id", False, False),
    ("bids", "session_id", False, False),
    ("bids", "bidder_id", False, False),
)

FOREIGN_KEY_DEFINITIONS = (
    (
        "auction_items",
        "fk_auction_items_category",
        "category_id",
        "categories",
        "id",
        None,
    ),
    (
        "auction_items",
        "fk_auction_items_seller",
        "seller_id",
        "users",
        "id",
        None,
    ),
    (
        "auction_items",
        "fk_auction_items_session",
        "session_id",
        "auction_sessions",
        "id",
        "CASCADE",
    ),
    (
        "auction_items",
        "fk_auction_items_winner",
        "winner_user_id",
        "users",
        "id",
        None,
    ),
    (
        "auction_session_rules",
        "fk_auction_session_rules_session",
        "session_id",
        "auction_sessions",
        "id",
        "CASCADE",
    ),
    (
        "auction_sessions",
        "fk_auction_sessions_seller",
        "seller_id",
        "users",
        "id",
        None,
    ),
    (
        "bids",
        "fk_bids_bidder",
        "bidder_id",
        "users",
        "id",
        None,
    ),
    (
        "bids",
        "fk_bids_item",
        "item_id",
        "auction_items",
        "id",
        "CASCADE",
    ),
    (
        "bids",
        "fk_bids_session",
        "session_id",
        "auction_sessions",
        "id",
        "CASCADE",
    ),
    (
        "item_images",
        "fk_item_images_item",
        "item_id",
        "auction_items",
        "id",
        "CASCADE",
    ),
)


def _convert_uuid_column(
    table: str,
    column: str,
    nullable: bool,
    is_primary_key: bool,
) -> None:
    temp_column = f"{column}_char"
    null_sql = "NULL" if nullable else "NOT NULL"

    op.execute(
        f"ALTER TABLE `{table}` "
        f"ADD COLUMN `{temp_column}` CHAR(36) {null_sql}"
    )

    if nullable:
        op.execute(
            f"UPDATE `{table}` "
            f"SET `{temp_column}` = BIN_TO_UUID(`{column}`) "
            f"WHERE `{column}` IS NOT NULL"
        )
    else:
        op.execute(
            f"UPDATE `{table}` "
            f"SET `{temp_column}` = BIN_TO_UUID(`{column}`)"
        )

    if is_primary_key:
        op.execute(f"ALTER TABLE `{table}` DROP PRIMARY KEY")

    op.execute(f"ALTER TABLE `{table}` DROP COLUMN `{column}`")
    op.execute(
        f"ALTER TABLE `{table}` "
        f"CHANGE `{temp_column}` `{column}` CHAR(36) {null_sql}"
    )

    if is_primary_key:
        op.execute(f"ALTER TABLE `{table}` ADD PRIMARY KEY (`{column}`)")


def _restore_uuid_column(
    table: str,
    column: str,
    nullable: bool,
    is_primary_key: bool,
) -> None:
    temp_column = f"{column}_bin"
    null_sql = "NULL" if nullable else "NOT NULL"

    op.execute(
        f"ALTER TABLE `{table}` "
        f"ADD COLUMN `{temp_column}` BINARY(16) {null_sql}"
    )

    if nullable:
        op.execute(
            f"UPDATE `{table}` "
            f"SET `{temp_column}` = UUID_TO_BIN(`{column}`) "
            f"WHERE `{column}` IS NOT NULL"
        )
    else:
        op.execute(
            f"UPDATE `{table}` "
            f"SET `{temp_column}` = UUID_TO_BIN(`{column}`)"
        )

    if is_primary_key:
        op.execute(f"ALTER TABLE `{table}` DROP PRIMARY KEY")

    op.execute(f"ALTER TABLE `{table}` DROP COLUMN `{column}`")
    op.execute(
        f"ALTER TABLE `{table}` "
        f"CHANGE `{temp_column}` `{column}` BINARY(16) {null_sql}"
    )

    if is_primary_key:
        op.execute(f"ALTER TABLE `{table}` ADD PRIMARY KEY (`{column}`)")


def upgrade() -> None:
    """Skipped: tables are created with CHAR(36) UUIDs in 171bf3dda30e."""
    pass


def downgrade() -> None:
    """Skipped: see 171bf3dda30e downgrade."""
    pass
