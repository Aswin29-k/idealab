from __future__ import annotations

import json
import os
import re
import socket
from datetime import date, timedelta
from html import escape
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from uuid import uuid4

import streamlit as st


st.set_page_config(
    page_title="AICTE IDEA Lab | CARE College of Engineering",
    page_icon=":material/precision_manufacturing:",
    layout="wide",
)

NAV_ITEMS = (
    "Home",
    "Mission & Vision",
    "Components List",
    "Programs",
    "Components Rental",
    "Machinery",
    "Contact",
)
MENTOR_PHOTO_DIR = Path(__file__).parent / "assets" / "mentors"
COLLEGE_LOGO_PATH = Path(__file__).parent / "assets" / "care-college-logo.png"
TECH_GURUS = (
    (
        "Mr. R Saravanan",
        "Assistant Professor",
        "Electronics and Communication Engineering",
        "rsaravanan@care.ac.in",
        "9489202756",
    ),
    (
        "Mr. R. Selvamanikandan",
        "Assistant Professor",
        "Electronics and Communication Engineering",
        "r.selvamanikandan@care.ac.in",
        "8778368248",
    ),
    (
        "Mr. S. Arun Prakash",
        "Assistant Professor",
        "Mechanical Engineering",
        "s.arunprakash@care.ac.in",
        "7639561103",
    ),
    (
        "Mr. A. P. Ragunath",
        "Assistant Professor",
        "Mechanical Engineering",
        "apragunath@care.ac.in",
        "9025815277",
    ),
    (
        "Mr. A. Karthick Kumar",
        "Assistant Professor",
        "Computer Science and Engineering",
        "karthickkumar@care.ac.in",
        "9965040068",
    ),
    (
        "Ms. F. Shakila Banu",
        "Assistant Professor",
        "Computer Science and Engineering",
        "fshakilabanu@care.ac.in",
        "9797111089",
    ),
)
ACTIVITIES = (
    (
        "1",
        "Faculty Development Program (FDP)",
        "Faculty Members",
        "To equip faculties with hands-on expertise in IDEA Lab tools and technologies to effectively mentor students in innovation and entrepreneurship.",
        "Twice a year",
    ),
    (
        "2",
        "Skilling Programs",
        "Students",
        "To provide students with practical training in emerging technologies and fabrication skills aligned with industry and societal needs.",
        "Once per quarter",
    ),
    (
        "3",
        "Bootcamps",
        "Faculty",
        "To strengthen faculty competencies in advanced technologies and innovation practices for guiding student projects and research.",
        "Twice a year",
    ),
    (
        "4",
        "Ideation Workshops",
        "Students",
        "To train students in creative thinking and design approaches for developing innovative and problem-driven solutions.",
        "Once in three months",
    ),
    (
        "5",
        "Industry Awareness Workshops",
        "Industry Participants",
        "To promote collaboration between CARE College of Engineering and industry through awareness of IDEA Lab facilities.",
        "Once in three months",
    ),
    (
        "6",
        "Internships",
        "Students",
        "To enable students to gain industry-based practical exposure and solve real-world problems.",
        "As per curriculum",
    ),
    (
        "7",
        "Professional Skilling Programs",
        "ITI / School Pass-out Students",
        "To enhance hands-on technical skills in fabrication and manufacturing using AICTE IDEA Lab facilities.",
        "Once per quarter",
    ),
    (
        "8",
        "School Teachers Awareness Program",
        "School Teachers",
        "To familiarize school teachers with AICTE IDEA Lab facilities and experiential learning opportunities.",
        "Twice a year",
    ),
    (
        "9",
        "Projects by School Students",
        "School Students",
        "To encourage school students to develop innovative projects using AICTE IDEA Lab resources.",
        "Once a year",
    ),
    (
        "10",
        "Open Day for School Students",
        "School Students (XI–XII)",
        "To inspire young learners by providing exposure to AICTE IDEA Lab facilities and innovations.",
        "Once a year",
    ),
    (
        "11",
        "Participation in Technical Exhibitions",
        "Students & Faculty",
        "To showcase innovations, prototypes, and research outcomes developed at AICTE IDEA Lab.",
        "Once a year",
    ),
    (
        "12",
        "Newsletter",
        "All Stakeholders",
        "To disseminate updates and achievements of AICTE IDEA Lab to stakeholders.",
        "Monthly / Bi-monthly",
    ),
    (
        "13",
        "Webpage",
        "All Stakeholders",
        "To maintain an active online presence showcasing AICTE IDEA Lab activities and outcomes.",
        "Weekly / Bi-weekly",
    ),
    (
        "14",
        "Annual Conference / Symposium",
        "IDEA Labs & Partner Institutions",
        "To promote knowledge sharing, collaboration, and innovation among IDEA Labs and partner institutions.",
        "Once a year",
    ),
)
EQUIPMENT = (
    (
        "PCB Milling Machine",
        "A PCB milling machine is a standalone system capable of carrying out all "
        "the necessary steps to fabricate a prototype circuit board, except for "
        "via insertion and through-hole plating. It operates using a standard AC "
        "mains power supply and requires only a shop-type vacuum cleaner for dust "
        "extraction.",
    ),
    (
        "Laser Cutter",
        "A laser cutter is a versatile machine that uses a focused laser beam to "
        "precisely cut, engrave, or etch a wide range of materials. It operates "
        "with high accuracy and speed, making it suitable for prototyping, "
        "manufacturing, and design applications.",
    ),
    (
        "3D PRINTER",
        "A 3D printer is a machine that requires proper care and maintenance to "
        "ensure accurate printing and long service life. Regular cleaning of the "
        "print bed and nozzle, correct calibration, proper material handling, "
        "and timely inspection of mechanical and electrical components help "
        "maintain print quality, prevent failures, and ensure safe operation.",
    ),
    (
        "CNC ROUTER",
        "A CNC router at the College of Engineering is a precision machine that "
        "requires proper care and responsible use to ensure safe operation, "
        "accuracy, and long-term reliability. Regular maintenance, correct tool "
        "handling, proper calibration, and adherence to lab safety guidelines "
        "help protect the equipment, support effective learning, and ensure "
        "continuous availability for students and research activities.",
    ),
    (
        "MINI DESKTOP LATHE CUM MILLING",
        "A mini desktop lathe cum milling machine at the College of Engineering "
        "is a compact, multifunctional tool used for precision turning and "
        "milling operations.",
    ),
)


def render_empty_state(title: str, message: str) -> None:
    with st.container(border=True):
        st.subheader(title)
        st.write(message)
        st.caption(
            "No sample inventory, program, or machine records are shown as real lab data."
        )


def render_home() -> None:
    hero_left, hero_right = st.columns([1.15, 0.85], vertical_alignment="center")

    with hero_left:
        st.caption("INNOVATION · DESIGN · ENGINEERING · APPLICATION")
        st.title("Ideas take shape here.")
        st.subheader("AICTE IDEA Lab")
        st.write("CARE College of Engineering")
        st.write(
            "A collaborative space for students to explore ideas, learn by doing, "
            "and develop practical solutions through hands-on engineering."
        )
        st.badge("Student innovation space", icon=":material/lightbulb:")
    with hero_right:
        st.html(HERO_ILLUSTRATION)
        st.caption("Illustrative graphic — not a photograph of the lab.")

    st.space("large")
    st.header("From curiosity to prototype")
    st.write(
        "The IDEA Lab supports a practical, interdisciplinary approach to learning. "
        "Students can explore concepts, work together, and turn project ideas into "
        "prototypes as verified lab resources and programs become available."
    )
    pillars = st.columns(3)
    for column, icon, heading, description in zip(
        pillars,
        (":material/explore:", ":material/handyman:", ":material/science:"),
        ("Explore", "Build", "Learn"),
        (
            "Start with a question and investigate possible solutions.",
            "Apply engineering concepts through practical project work.",
            "Develop skills through experimentation and reflection.",
        ),
    ):
        with column.container(border=True, height="stretch"):
            st.subheader(heading, icon=icon)
            st.write(description)

    st.space("large")
    st.header("Our mentors")
    mentors = (
        (
            "chief-mentor-dr-s-shanthi.jpg",
            "Dr. S. Shanthi",
            "Chief mentor",
            "Principal",
        ),
        (
            "coordinator-dr-d-r-rajkumar.jpg",
            "Dr. D. R. Rajkumar",
            "Coordinator",
            "Professor & Head, Mechanical Engineering",
        ),
        (
            "co-coordinator-ms-r-vanitha.jpg",
            "Ms. R. Vanitha",
            "Co-coordinator",
            "Assistant Professor, ECE",
        ),
    )
    for column, (photo, name, role, designation) in zip(st.columns(3), mentors):
        with column.container(border=True, height="stretch"):
            st.image(
                str(MENTOR_PHOTO_DIR / photo),
                alt=f"{role}: {name}",
                width="stretch",
            )
            st.subheader(name)
            st.caption(role)
            st.write(designation)

    st.space("large")
    st.header("Tech Guru")
    st.write(
        "Meet the faculty supporting innovation and engineering across our "
        "academic departments."
    )
    for row_start in range(0, len(TECH_GURUS), 3):
        for column, (name, designation, department, email, phone) in zip(
            st.columns(3),
            TECH_GURUS[row_start : row_start + 3],
        ):
            with column.container(border=True, height="stretch"):
                st.subheader(name, icon=":material/person:")
                st.caption(designation)
                st.badge(department, icon=":material/school:")
                st.space("small")
                st.markdown(f":material/mail: [{email}](mailto:{email})")
                st.markdown(f":material/call: [{phone}](tel:{phone})")


def render_mission_vision() -> None:
    st.title("Mission & Vision")
    st.write("A shared purpose for hands-on learning and meaningful innovation.")
    mission, vision = st.columns(2)
    with mission.container(border=True, height="stretch"):
        st.subheader("Our mission", icon=":material/track_changes:")
        st.write(
            "To encourage innovation through practical learning, accessible "
            "prototyping, collaborative research, and the development of student "
            "projects that connect engineering knowledge with real-world needs."
        )
    with vision.container(border=True, height="stretch"):
        st.subheader("Our vision", icon=":material/visibility:")
        st.write(
            "To nurture a learning community where students confidently transform "
            "ideas into thoughtful, testable solutions and grow into resourceful "
            "engineers and innovators."
        )

    st.header("What we aim to enable")
    goals = st.columns(3)
    for column, icon, heading, description in zip(
        goals,
        (":material/emoji_objects:", ":material/build:", ":material/groups:"),
        ("Innovation", "Prototyping", "Student projects"),
        (
            "Make space for curiosity, experimentation, and new approaches.",
            "Build practical capability by taking concepts into prototypes.",
            "Support collaborative projects, research, and applied learning.",
        ),
    ):
        with column.container(border=True, height="stretch"):
            st.subheader(heading, icon=icon)
            st.write(description)


def render_components() -> None:
    st.title("Components list")
    st.write("Browse verified electronic components and their current availability.")
    search_col, category_col = st.columns([2, 1], vertical_alignment="bottom")
    with search_col:
        st.text_input(
            "Search components",
            placeholder="Search by component name",
            type="search",
            key="component_search",
        )
    with category_col:
        st.selectbox(
            "Category",
            ["No categories available"],
            key="component_category",
            disabled=True,
        )
    render_empty_state(
        "Component data is not connected",
        "No existing Google Sheets integration or verified component inventory "
        "was present in the supplied project. Configure the existing data source "
        "before publishing component names, photos, quantities, or availability.",
    )


def render_programs() -> None:
    st.title("Programs")
    st.header("Proposed Activities for IDEA LAB")
    st.write(
        "Proposed Activities for AICTE IDEA Lab, CARE College of Engineering include "
        "hands-on innovation workshops, design thinking and problem-solving sessions, "
        "interdisciplinary project development, prototyping and product realization "
        "activities, student innovation challenges and hackathons, faculty- and "
        "student-led technical training programs, industry and startup mentorship "
        "interactions, community-oriented technology solutions, IPR and "
        "entrepreneurship awareness programs, and continuous incubation support to "
        "transform ideas into scalable and socially relevant engineering solutions."
    )
    headers = (
        "Sl. No.",
        "Activity / Program",
        "Target Participants",
        "Purpose (CARE College of Engineering)",
        "Frequency",
    )
    header_html = "".join(f"<th scope='col'>{escape(header)}</th>" for header in headers)
    rows_html = "".join(
        "<tr>"
        + "".join(f"<td>{escape(value)}</td>" for value in activity)
        + "</tr>"
        for activity in ACTIVITIES
    )
    st.markdown(
        """
        <style>
        :root {
            --idea-navy: #123B63;
            --idea-green: #32B56A;
            --idea-blue: #2789C9;
            --idea-light-blue: #EAF5FC;
            --idea-white: #FFFFFF;
            --idea-light-grey: #F4F6F8;
            --idea-dark-text: #243447;
            --idea-border: #D7E3EC;
            --idea-muted: #5C6F82;
        }
        .stApp,
        [data-testid="stAppViewContainer"] {
            background: var(--idea-light-grey);
            color: var(--idea-dark-text);
        }
        [data-testid="stHeader"] {
            background: rgba(244, 246, 248, 0.88);
        }
        [data-testid="stMainBlockContainer"] {
            max-width: 1280px;
            padding-top: 1.6rem;
            padding-bottom: 2.5rem;
        }
        [data-testid="stSidebar"] {
            background: linear-gradient(180deg, var(--idea-navy), #0D2E4D);
            color: var(--idea-white);
        }
        [data-testid="stSidebar"] label,
        [data-testid="stSidebar"] p,
        [data-testid="stSidebar"] span {
            color: inherit;
        }
        main [data-testid="stHeading"] h1,
        main [data-testid="stHeading"] h2 {
            color: var(--idea-navy);
            letter-spacing: -0.025em;
        }
        main [data-testid="stHeading"] h1::after,
        main [data-testid="stHeading"] h2::after {
            display: block;
            width: 4.4rem;
            height: 0.22rem;
            margin-top: 0.48rem;
            border-radius: 1rem;
            background: linear-gradient(90deg, var(--idea-green), var(--idea-blue));
            content: "";
            transform: scaleX(0.45);
            transform-origin: left;
            animation: idea-underline-in 460ms ease-out forwards;
        }
        @keyframes idea-underline-in {
            to { transform: scaleX(1); }
        }
        main [data-testid="stVerticalBlock"]:not(:has(> [data-testid="stVerticalBlock"]))
        :has(> [data-testid="stElementContainer"] [data-testid="stHeading"]) {
            border-color: var(--idea-border) !important;
            border-radius: 1rem !important;
            background: var(--idea-white);
            box-shadow: 0 5px 18px rgba(18, 59, 99, 0.055);
            animation: idea-section-in 420ms ease-out both;
            transition: transform 180ms ease, box-shadow 180ms ease,
                border-color 180ms ease;
        }
        main [data-testid="stVerticalBlock"]:not(:has(> [data-testid="stVerticalBlock"]))
        :has(> [data-testid="stElementContainer"] [data-testid="stHeading"]):hover {
            border-color: rgba(39, 137, 201, 0.38) !important;
            box-shadow: 0 10px 26px rgba(18, 59, 99, 0.1);
            transform: translateY(-2px);
        }
        @keyframes idea-section-in {
            from { opacity: 0.82; transform: translateY(7px); }
            to { opacity: 1; transform: translateY(0); }
        }
        main [data-testid="stImage"] img {
            transition: transform 220ms ease, filter 220ms ease;
        }
        main [data-testid="stImage"]:hover img {
            transform: scale(1.018);
        }
        main [data-testid="stTextInput"] input,
        main [data-testid="stNumberInput"] input,
        main [data-testid="stTextArea"] textarea,
        main [data-testid="stDateInput"] input,
        main [data-testid="stSelectbox"] [data-baseweb="select"] > div {
            border-color: var(--idea-border);
            background-color: var(--idea-white);
            color: var(--idea-dark-text);
            transition: border-color 160ms ease, box-shadow 160ms ease;
        }
        main [data-testid="stTextInputRootElement"]:focus-within,
        main [data-testid="stNumberInputContainer"]:focus-within,
        main [data-testid="stTextAreaRootElement"]:focus-within {
            border-color: var(--idea-blue);
            box-shadow: 0 0 0 0.15rem rgba(39, 137, 201, 0.16);
        }
        main [data-testid="stTextInput"] input:focus,
        main [data-testid="stNumberInput"] input:focus,
        main [data-testid="stTextArea"] textarea:focus,
        main [data-testid="stDateInput"] input:focus,
        main [data-testid="stSelectbox"] [data-baseweb="select"]:focus-within > div {
            border-color: var(--idea-blue);
            box-shadow: 0 0 0 0.15rem rgba(39, 137, 201, 0.16);
        }
        main button[kind="primary"],
        main [data-testid="stBaseButton-primary"] {
            border: 0;
            background: linear-gradient(110deg, var(--idea-navy), var(--idea-blue));
            color: var(--idea-white);
            transition: transform 160ms ease, box-shadow 160ms ease, filter 160ms ease;
        }
        main button[kind="primary"]:hover,
        main [data-testid="stBaseButton-primary"]:hover {
            box-shadow: 0 6px 16px rgba(18, 59, 99, 0.2);
            filter: saturate(1.12);
            transform: translateY(-1px);
        }
        main button[kind="secondary"],
        main [data-testid="stBaseButton-secondary"] {
            border-color: var(--idea-blue);
            background: linear-gradient(110deg, var(--idea-light-blue), var(--idea-white));
            color: var(--idea-navy);
            transition: transform 160ms ease, box-shadow 160ms ease, background 160ms ease;
        }
        main button[kind="secondary"]:hover,
        main [data-testid="stBaseButton-secondary"]:hover {
            border-color: var(--idea-green);
            box-shadow: 0 5px 14px rgba(18, 59, 99, 0.12);
            transform: translateY(-1px);
        }
        .activities-table-scroll {
            max-width: 100%;
            overflow-x: auto;
            border: 1px solid var(--idea-border);
            border-radius: 0.65rem;
            background: var(--idea-white);
            scrollbar-color: var(--idea-blue) var(--idea-light-blue);
        }
        .activities-table {
            width: 100%;
            min-width: 980px;
            table-layout: fixed;
            border-collapse: collapse;
            color: var(--idea-dark-text);
            font-size: 0.94rem;
        }
        .activities-table th,
        .activities-table td {
            padding: 0.85rem 0.9rem;
            text-align: left;
            vertical-align: top;
            overflow-wrap: anywhere;
            line-height: 1.5;
            border-bottom: 1px solid var(--idea-border);
        }
        .activities-table th {
            background: var(--idea-navy);
            color: var(--idea-white);
            font-weight: 650;
        }
        .activities-table tbody tr:nth-child(odd) {
            background: var(--idea-light-grey);
        }
        .activities-table tbody tr:nth-child(even) {
            background: var(--idea-white);
        }
        .activities-table tbody tr:last-child td {
            border-bottom: 0;
        }
        .activities-table th:nth-child(1),
        .activities-table td:nth-child(1) { width: 6%; }
        .activities-table th:nth-child(2),
        .activities-table td:nth-child(2) { width: 19%; }
        .activities-table th:nth-child(3),
        .activities-table td:nth-child(3) { width: 17%; }
        .activities-table th:nth-child(4),
        .activities-table td:nth-child(4) { width: 42%; }
        .activities-table th:nth-child(5),
        .activities-table td:nth-child(5) { width: 16%; }
        @media (max-width: 640px) {
            .activities-table { font-size: 0.88rem; }
            .activities-table th,
            .activities-table td { padding: 0.7rem; }
            [data-testid="stMainBlockContainer"] {
                padding-left: 1rem;
                padding-right: 1rem;
            }
        }
        @media (prefers-reduced-motion: reduce) {
            *,
            *::before,
            *::after {
                scroll-behavior: auto !important;
                animation-duration: 0.01ms !important;
                animation-iteration-count: 1 !important;
                transition-duration: 0.01ms !important;
            }
        }
        </style>
        """,
        unsafe_allow_html=True,
    )
    st.markdown(
        "<div class='activities-table-scroll' role='region' "
        "aria-label='Proposed Activities table' tabindex='0'>"
        f"<table class='activities-table'><thead><tr>{header_html}</tr></thead>"
        f"<tbody>{rows_html}</tbody></table></div>",
        unsafe_allow_html=True,
    )


def render_rental() -> None:
    st.title("Components rental")
    st.write(
        "Review availability and submit a request for a lab component or machine."
    )
    st.warning(
        "Google Sheets inventory is not configured, so component names, quantities, "
        "and availability cannot be verified here. You can still email a request; "
        "all requests remain pending administrator confirmation.",
        icon=":material/warning:",
    )
    st.subheader("Google Sheets inventory")
    st.info(
        "No Google Sheets inventory integration is configured. No stock or rental "
        "status is displayed, and submitting a request does not reserve an item."
    )

    st.subheader("Rental request")
    if "rental_flash_success" in st.session_state:
        st.success(st.session_state.pop("rental_flash_success"))
    st.session_state.setdefault("rental_form_version", 0)
    form_version = st.session_state["rental_form_version"]
    submission_id_key = f"rental_submission_id_{form_version}"
    st.session_state.setdefault(submission_id_key, uuid4().hex)

    with st.form(f"rental_request_{form_version}", border=True):
        name = st.text_input(
            "Student or staff name", key=f"rental_name_{form_version}"
        )
        department = st.text_input(
            "Department", key=f"rental_department_{form_version}"
        )
        contact = st.text_input(
            "Contact details (email or phone)", key=f"rental_contact_{form_version}"
        )
        item = st.text_input(
            "Component or machine required",
            key=f"rental_item_{form_version}",
        )
        quantity = st.number_input(
            "Quantity",
            min_value=1,
            step=1,
            value=1,
            key=f"rental_quantity_{form_version}",
        )
        required_date = st.date_input(
            "Required date",
            value=date.today(),
            key=f"rental_required_date_{form_version}",
        )
        return_date = st.date_input(
            "Return date",
            value=date.today() + timedelta(days=1),
            key=f"rental_return_date_{form_version}",
        )
        purpose = st.text_area(
            "Purpose of rental", key=f"rental_purpose_{form_version}"
        )
        submitted = st.form_submit_button(
            "Submit rental request",
            type="primary",
            icon=":material/send:",
        )

    if submitted:
        missing = [
            field
            for field, value in (
                ("student or staff name", name),
                ("department", department),
                ("contact details", contact),
                ("component or machine required", item),
                ("purpose of rental", purpose),
            )
            if not value.strip()
        ]
        if missing:
            st.error("Please complete the required fields: " + ", ".join(missing) + ".")
        elif return_date <= required_date:
            st.error("The return date must be later than the required date.")
        elif quantity < 1:
            st.error("Quantity must be at least one.")
        elif st.session_state.get("rental_submission_in_progress", False):
            st.warning("Your request is already being sent. Please wait.")
        else:
            st.session_state["rental_submission_in_progress"] = True
            with st.spinner("Sending your request..."):
                try:
                    accepted, result_message = submit_email_request(
                        {
                            "submissionId": st.session_state[submission_id_key],
                            "name": name,
                            "department": department,
                            "contact": contact,
                            "item": item,
                            "quantity": int(quantity),
                            "requiredDate": required_date.isoformat(),
                            "returnDate": return_date.isoformat(),
                            "purpose": purpose,
                        },
                        "/api/rental-request",
                        "Rental request",
                    )
                finally:
                    st.session_state["rental_submission_in_progress"] = False

            if accepted:
                st.session_state["rental_flash_success"] = result_message
                st.session_state["rental_form_version"] = form_version + 1
                st.rerun()
            else:
                st.error(result_message)


def render_machinery() -> None:
    st.title("List of Equipments")
    search = st.text_input(
        "Search machinery",
        placeholder="Search by equipment name or description",
        type="search",
        key="machinery_search",
    ).strip().casefold()
    visible_equipment = [
        (name, description)
        for name, description in EQUIPMENT
        if not search or search in name.casefold() or search in description.casefold()
    ]
    if not visible_equipment:
        st.info("No equipment matches your search. Try a different search term.")
        return

    for name, description in visible_equipment:
        with st.container(border=True):
            st.subheader(name)
            st.write(description)


def render_contact() -> None:
    st.title("Contact")
    st.write("Get in touch with the AICTE IDEA Lab at CARE College of Engineering.")
    st.caption(
        "Official contact details, the college location, and working hours were "
        "not present in the supplied project."
    )

    details = st.columns(4)
    for column, icon, label in zip(
        details,
        (
            ":material/location_on:",
            ":material/mail:",
            ":material/call:",
            ":material/schedule:",
        ),
        ("Address", "Official email", "Phone", "Working hours"),
    ):
        with column.container(border=True, height="stretch"):
            st.subheader(label, icon=icon)
            st.write("Not configured")

    st.subheader("Send a message")
    st.caption("Your message is sent securely to the configured IDEA Lab contact.")
    if "contact_flash_success" in st.session_state:
        st.success(st.session_state.pop("contact_flash_success"))
    st.session_state.setdefault("contact_form_version", 0)
    form_version = st.session_state["contact_form_version"]
    form_key = f"contact_message_{form_version}"
    id_key = f"contact_submission_id_{form_version}"
    st.session_state.setdefault(id_key, uuid4().hex)

    with st.form(form_key, border=True):
        name = st.text_input("Full name", key=f"contact_name_{form_version}")
        email = st.text_input("Email address", key=f"contact_email_{form_version}")
        phone = st.text_input("Phone number", key=f"contact_phone_{form_version}")
        organization = st.text_input(
            "Organization / college name", key=f"contact_organization_{form_version}"
        )
        subject = st.text_input("Subject", key=f"contact_subject_{form_version}")
        message = st.text_area("Message", key=f"contact_body_{form_version}")
        submitted = st.form_submit_button(
            "Send message",
            type="primary",
            icon=":material/send:",
        )

    if submitted:
        missing = [
            field
            for field, value in (
                ("name", name),
                ("email", email),
                ("subject", subject),
                ("message", message),
            )
            if not value.strip()
        ]
        if missing:
            st.error("Please complete the required fields: " + ", ".join(missing) + ".")
        elif not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email.strip()):
            st.error("Enter a valid email address.")
        elif st.session_state.get("contact_submission_in_progress", False):
            st.warning("Your message is already being sent. Please wait.")
        else:
            st.session_state["contact_submission_in_progress"] = True
            with st.spinner("Sending your message..."):
                try:
                    accepted, result_message = submit_email_request(
                        {
                            "submissionId": st.session_state[id_key],
                            "name": name,
                            "email": email,
                            "phone": phone,
                            "organization": organization,
                            "subject": subject,
                            "message": message,
                        },
                        "/api/contact",
                        "Message",
                    )
                finally:
                    st.session_state["contact_submission_in_progress"] = False

            if accepted:
                st.session_state["contact_flash_success"] = result_message
                st.session_state["contact_form_version"] = form_version + 1
                st.rerun()
            else:
                st.error(result_message)


def resolve_api_base_url() -> str:
    raw_url = os.environ.get("IDEA_LAB_CONTACT_API_URL", "").strip()
    if not raw_url:
        return "http://localhost:5000"

    normalized = raw_url.rstrip("/")
    for suffix in ("/api/contact", "/api/rental-request", "/api"):
        if normalized.lower().endswith(suffix.lower()):
            normalized = normalized[: -len(suffix)]
            break
    return normalized


def submit_email_request(
    payload: dict[str, object], endpoint: str, request_label: str
) -> tuple[bool, str]:
    is_production = (
        os.environ.get("RENDER", "").strip().lower() == "true"
        or bool(os.environ.get("RENDER_EXTERNAL_URL", "").strip())
        or os.environ.get("NODE_ENV", "").strip().lower() == "production"
        or os.environ.get("APP_ENV", "").strip().lower() in {"prod", "production"}
    )
    api_base_url = resolve_api_base_url()
    if not os.environ.get("IDEA_LAB_CONTACT_API_URL", "").strip():
        if is_production:
            return (
                False,
                f"{request_label} not sent: IDEA_LAB_CONTACT_API_URL is not set. "
                "Configure it in the Streamlit frontend service with the public "
                "base URL of your deployed email backend (for example, "
                "https://your-render-service.onrender.com). Do not include /api/contact.",
            )

    full_url = f"{api_base_url}{endpoint}"
    if not api_base_url.startswith(("http://", "https://")):
        return (
            False,
            f"{request_label} not sent: IDEA_LAB_CONTACT_API_URL must be a full HTTP(S) base URL, "
            "not a relative path. Example: https://your-render-service.onrender.com",
        )

    request = Request(
        full_url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json", "Accept": "application/json"},
        method="POST",
    )
    try:
        with urlopen(request, timeout=20) as response:
            response_body = response.read().decode("utf-8")
    except HTTPError as error:
        response_body = error.read().decode("utf-8", errors="replace")
        try:
            body = json.loads(response_body)
        except json.JSONDecodeError:
            if error.code == 502:
                return (
                    False,
                    "The email gateway returned HTTP 502. The backend or mail "
                    "provider is currently unavailable; check the backend logs.",
                )
            if error.code == 500:
                return (
                    False,
                    "The email backend returned HTTP 500. No message was confirmed; "
                    "check the backend logs.",
                )
            return (
                False,
                f"The email backend returned HTTP {error.code} with an invalid response.",
            )
        if isinstance(body, dict) and isinstance(body.get("message"), str):
            return False, f"{body['message']} (HTTP {error.code})."
        return False, f"The email backend returned HTTP {error.code}."
    except URLError as error:
        if isinstance(error.reason, ConnectionRefusedError):
            return (
                False,
                "The email backend refused the connection at the configured API "
                "address. Start the Node.js backend with `cd backend; npm.cmd start`. "
                "For a deployed site, set IDEA_LAB_CONTACT_API_URL to a backend URL "
                "reachable from the Streamlit server.",
            )
        if isinstance(error.reason, (TimeoutError, socket.timeout)):
            return (
                False,
                "The email backend could not be reached before the connection "
                "timed out. Check that the backend is running and that "
                "IDEA_LAB_CONTACT_API_URL is reachable from the Streamlit server.",
            )
        if isinstance(error.reason, OSError):
            return (
                False,
                "A network error prevented a connection to the email backend. "
                "Check its address and confirm it is reachable from the Streamlit server.",
            )
        return (
            False,
            "The email backend could not be reached. Check that it is running and "
            "that IDEA_LAB_CONTACT_API_URL is reachable from the Streamlit server.",
        )
    except UnicodeDecodeError:
        return (
            False,
            f"{request_label} not sent: the email service returned an invalid response.",
        )

    try:
        body = json.loads(response_body)
    except json.JSONDecodeError:
        return (
            False,
            f"{request_label} not sent: the email service returned an invalid response.",
        )
    if isinstance(body, dict) and body.get("ok") is True:
        message = body.get("message")
        if isinstance(message, str) and message.strip():
            return True, message
    if isinstance(body, dict) and isinstance(body.get("message"), str):
        return False, body["message"]
    return False, f"{request_label} not sent: the email service returned an error."


HERO_ILLUSTRATION = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 430" role="img" aria-label="Illustration of a connected engineering prototype with circuit paths">
<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#0b1f3a"/>
    <stop offset="1" stop-color="#123b5d"/>
  </linearGradient>
  <linearGradient id="board" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#155879"/>
    <stop offset="1" stop-color="#123c61"/>
  </linearGradient>
</defs>
<rect width="640" height="430" rx="28" fill="url(#bg)"/>
<circle cx="505" cy="86" r="54" fill="#11c5d9" opacity=".08"/>
<circle cx="505" cy="86" r="35" fill="none" stroke="#61e3ef" stroke-opacity=".4"/>
<path d="M52 344h536" stroke="#7edfea" stroke-opacity=".18"/>
<g fill="none" stroke="#36d2df" stroke-linecap="round" stroke-linejoin="round">
  <path d="M75 112h91l26 25v35h62m-87 77h-39l-22 22H82" stroke-width="3" opacity=".8"/>
  <path d="M431 105h72v62h-33l-32 32v51h-48" stroke-width="3" opacity=".75"/>
  <path d="M93 299h45m277 0h92m-218-170v36" stroke-width="3" opacity=".55"/>
</g>
<g fill="#62e4ee">
  <circle cx="75" cy="112" r="5"/><circle cx="82" cy="271" r="5"/>
  <circle cx="503" cy="105" r="5"/><circle cx="457" cy="299" r="5"/>
  <circle cx="167" cy="112" r="4"/><circle cx="507" cy="299" r="4"/>
</g>
<path d="m320 90 142 82v145l-142 82-142-82V172z" fill="url(#board)" stroke="#6ce5ed" stroke-opacity=".8" stroke-width="2"/>
<path d="m320 121 114 66v116l-114 66-114-66V187z" fill="#0c2948" stroke="#32cbdc" stroke-opacity=".65"/>
<path d="m320 151 84 49v70l-84 49-84-49v-70z" fill="#114568" stroke="#73e3eb" stroke-width="2"/>
<circle cx="320" cy="235" r="45" fill="#0b213c" stroke="#7cecf0" stroke-width="2"/>
<path d="M292 236h20l13-19 14 37 12-18h17" fill="none" stroke="#7cecf0" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
<g fill="#a2f5f3">
  <circle cx="320" cy="121" r="5"/><circle cx="434" cy="187" r="5"/>
  <circle cx="434" cy="303" r="5"/><circle cx="320" cy="369" r="5"/>
  <circle cx="206" cy="303" r="5"/><circle cx="206" cy="187" r="5"/>
</g>
<text x="320" y="414" text-anchor="middle" fill="#b8e7ef" font-family="Arial,sans-serif" font-size="13" letter-spacing="3">IDEAS INTO ENGINEERING</text>
</svg>"""


st.markdown(
    """
    <style>
    :root {
        --idea-navy: #123B63;
        --idea-green: #32B56A;
        --idea-blue: #2789C9;
        --idea-light-blue: #EAF5FC;
        --idea-white: #FFFFFF;
        --idea-light-grey: #F4F6F8;
        --idea-dark-text: #243447;
        --idea-border: #D7E3EC;
        --idea-muted: #5C6F82;
    }
    .stApp,
    [data-testid="stAppViewContainer"] {
        background: var(--idea-light-grey);
        color: var(--idea-dark-text);
    }
    [data-testid="stHeader"] {
        background: rgba(244, 246, 248, 0.88);
    }
    [data-testid="stMainBlockContainer"] {
        max-width: 1280px;
        padding-top: 1.6rem;
        padding-bottom: 2.5rem;
    }
    [data-testid="stSidebar"] {
        background: linear-gradient(180deg, var(--idea-navy), #0D2E4D);
        color: var(--idea-white);
    }
    [data-testid="stSidebar"] label,
    [data-testid="stSidebar"] p,
    [data-testid="stSidebar"] span {
        color: inherit;
    }
    main [data-testid="stHeading"] h1,
    main [data-testid="stHeading"] h2 {
        color: var(--idea-navy);
        letter-spacing: -0.025em;
    }
    main [data-testid="stHeading"] h1::after,
    main [data-testid="stHeading"] h2::after {
        display: block;
        width: 4.4rem;
        height: 0.22rem;
        margin-top: 0.48rem;
        border-radius: 1rem;
        background: linear-gradient(90deg, var(--idea-green), var(--idea-blue));
        content: "";
        transform: scaleX(0.45);
        transform-origin: left;
        animation: idea-underline-in 460ms ease-out forwards;
    }
    @keyframes idea-underline-in {
        to { transform: scaleX(1); }
    }
    main [data-testid="stVerticalBlock"]:not(:has(> [data-testid="stVerticalBlock"]))
    :has(> [data-testid="stElementContainer"] [data-testid="stHeading"]) {
        border-color: var(--idea-border) !important;
        border-radius: 1rem !important;
        background: var(--idea-white);
        box-shadow: 0 5px 18px rgba(18, 59, 99, 0.055);
        animation: idea-section-in 420ms ease-out both;
        transition: transform 180ms ease, box-shadow 180ms ease,
            border-color 180ms ease;
    }
    main [data-testid="stVerticalBlock"]:not(:has(> [data-testid="stVerticalBlock"]))
    :has(> [data-testid="stElementContainer"] [data-testid="stHeading"]):hover {
        border-color: rgba(39, 137, 201, 0.38) !important;
        box-shadow: 0 10px 26px rgba(18, 59, 99, 0.1);
        transform: translateY(-2px);
    }
    @keyframes idea-section-in {
        from { opacity: 0.82; transform: translateY(7px); }
        to { opacity: 1; transform: translateY(0); }
    }
    main [data-testid="stImage"] img {
        transition: transform 220ms ease, filter 220ms ease;
    }
    main [data-testid="stImage"]:hover img {
        transform: scale(1.018);
    }
    main [data-testid="stTextInput"] input,
    main [data-testid="stNumberInput"] input,
    main [data-testid="stTextArea"] textarea,
    main [data-testid="stDateInput"] input,
    main [data-testid="stSelectbox"] [data-baseweb="select"] > div {
        border-color: var(--idea-border);
        background-color: var(--idea-white);
        color: var(--idea-dark-text);
        transition: border-color 160ms ease, box-shadow 160ms ease;
    }
    main [data-testid="stTextInputRootElement"]:focus-within,
    main [data-testid="stNumberInputContainer"]:focus-within,
    main [data-testid="stTextAreaRootElement"]:focus-within {
        border-color: var(--idea-blue);
        box-shadow: 0 0 0 0.15rem rgba(39, 137, 201, 0.16);
    }
    main [data-testid="stTextInput"] input:focus,
    main [data-testid="stNumberInput"] input:focus,
    main [data-testid="stTextArea"] textarea:focus,
    main [data-testid="stDateInput"] input:focus,
    main [data-testid="stSelectbox"] [data-baseweb="select"]:focus-within > div {
        border-color: var(--idea-blue);
        box-shadow: 0 0 0 0.15rem rgba(39, 137, 201, 0.16);
    }
    main button[kind="primary"],
    main [data-testid="stBaseButton-primary"] {
        border: 0;
        background: linear-gradient(110deg, var(--idea-navy), var(--idea-blue));
        color: var(--idea-white);
        transition: transform 160ms ease, box-shadow 160ms ease, filter 160ms ease;
    }
    main button[kind="primary"]:hover,
    main [data-testid="stBaseButton-primary"]:hover {
        box-shadow: 0 6px 16px rgba(18, 59, 99, 0.2);
        filter: saturate(1.12);
        transform: translateY(-1px);
    }
    main button[kind="secondary"],
    main [data-testid="stBaseButton-secondary"] {
        border-color: var(--idea-blue);
        background: linear-gradient(110deg, var(--idea-light-blue), var(--idea-white));
        color: var(--idea-navy);
        transition: transform 160ms ease, box-shadow 160ms ease, background 160ms ease;
    }
    main button[kind="secondary"]:hover,
    main [data-testid="stBaseButton-secondary"]:hover {
        border-color: var(--idea-green);
        box-shadow: 0 5px 14px rgba(18, 59, 99, 0.12);
        transform: translateY(-1px);
    }
    .activities-table-scroll {
        max-width: 100%;
        overflow-x: auto;
        border: 1px solid var(--idea-border);
        border-radius: 0.65rem;
        background: var(--idea-white);
        scrollbar-color: var(--idea-blue) var(--idea-light-blue);
    }
    .activities-table {
        width: 100%;
        min-width: 980px;
        table-layout: fixed;
        border-collapse: collapse;
        color: var(--idea-dark-text);
        font-size: 0.94rem;
    }
    .activities-table th,
    .activities-table td {
        padding: 0.85rem 0.9rem;
        text-align: left;
        vertical-align: top;
        overflow-wrap: anywhere;
        line-height: 1.5;
        border-bottom: 1px solid var(--idea-border);
    }
    .activities-table th {
        background: var(--idea-navy);
        color: var(--idea-white);
        font-weight: 650;
    }
    .activities-table tbody tr:nth-child(odd) {
        background: var(--idea-light-grey);
    }
    .activities-table tbody tr:nth-child(even) {
        background: var(--idea-white);
    }
    .activities-table tbody tr:last-child td {
        border-bottom: 0;
    }
    .activities-table th:nth-child(1),
    .activities-table td:nth-child(1) { width: 6%; }
    .activities-table th:nth-child(2),
    .activities-table td:nth-child(2) { width: 19%; }
    .activities-table th:nth-child(3),
    .activities-table td:nth-child(3) { width: 17%; }
    .activities-table th:nth-child(4),
    .activities-table td:nth-child(4) { width: 42%; }
    .activities-table th:nth-child(5),
    .activities-table td:nth-child(5) { width: 16%; }
    @media (max-width: 640px) {
        .activities-table { font-size: 0.88rem; }
        .activities-table th,
        .activities-table td { padding: 0.7rem; }
        [data-testid="stMainBlockContainer"] {
            padding-left: 1rem;
            padding-right: 1rem;
        }
    }
    @media (prefers-reduced-motion: reduce) {
        *,
        *::before,
        *::after {
            scroll-behavior: auto !important;
            animation-duration: 0.01ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: 0.01ms !important;
        }
    }
    .st-key-main_navigation [role="radiogroup"] {
        gap: 0.4rem;
        flex-wrap: wrap;
    }
    .st-key-main_navigation [role="radio"] {
        border: 1px solid var(--idea-border);
        border-radius: 999px;
        background: var(--idea-white);
        color: var(--idea-navy);
        transition: transform 160ms ease, box-shadow 160ms ease,
            border-color 160ms ease, background 160ms ease;
    }
    .st-key-main_navigation [role="radio"]:hover {
        border-color: var(--idea-green);
        box-shadow: 0 4px 14px rgba(18, 59, 99, 0.12);
        transform: translateY(-1px);
    }
    .st-key-main_navigation [role="radio"][aria-checked="true"] {
        border-color: var(--idea-navy);
        background: linear-gradient(110deg, var(--idea-navy), var(--idea-blue));
        color: var(--idea-white);
    }
    </style>
    """,
    unsafe_allow_html=True,
)

brand_col, institution_col = st.columns([1.2, 1], vertical_alignment="center")
with brand_col:
    st.markdown("### :material/precision_manufacturing: AICTE IDEA Lab")
with institution_col:
    with st.container(horizontal_alignment="right"):
        st.image(
            str(COLLEGE_LOGO_PATH),
            alt="CARE College of Engineering logo with accreditation marks",
            width=320,
        )

selected_page = st.segmented_control(
    "Main navigation",
    options=NAV_ITEMS,
    default="Home",
    key="main_navigation",
    label_visibility="collapsed",
    width="stretch",
    wrap=True,
)

if selected_page == "Home":
    render_home()
elif selected_page == "Mission & Vision":
    render_mission_vision()
elif selected_page == "Components List":
    render_components()
elif selected_page == "Programs":
    render_programs()
elif selected_page == "Components Rental":
    render_rental()
elif selected_page == "Machinery":
    render_machinery()
elif selected_page == "Contact":
    render_contact()
else:
    render_home()
