
from app.database import Base, engine

# Import models so SQLAlchemy can register their tables
from app.models.user import User
from app.models.mother_profile import MotherProfile


def create_tables():
    Base.metadata.create_all(bind=engine)
    print("Database tables created successfully!")


if __name__ == "__main__":
    create_tables()
