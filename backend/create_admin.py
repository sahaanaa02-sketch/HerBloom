"""Compatibility entry point for the secure Admin bootstrap command."""
from app.seed.create_super_admin import create_super_admin


if __name__ == "__main__":
    create_super_admin()
