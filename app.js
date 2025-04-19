require("dotenv").config();

const express = require("express");
const app = express();
const mongoose = require("mongoose");
const path = require("path");
const port = 8080;
const engine = require("ejs-mate");
const session = require("express-session");
const flash = require("connect-flash");
const passport = require("passport");
const User = require("./models/user");
const LocalStrategy = require("passport-local");
const Goal = require("./models/goal");
const methodOverride = require("method-override");
const http = require("http");
const nodemailer = require("nodemailer");
const bodyParser = require("body-parser");

app.use(bodyParser.urlencoded({ extended: true }));

app.use(methodOverride("_method"));

main()
  .then(() => {
    console.log("Connected to MongoDB");
  })
  .catch((err) => {
    console.error("MongoDB connection error:", err.message);
  });

async function main() {
  await mongoose.connect("mongodb://127.0.0.1:27017/task-manager");
}

app.set("view engine", "ejs");
app.engine("ejs", engine);
app.set("views", path.join(__dirname, "views"));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

const sessionOptions = {
  secret: "mysecret",
  resave: false,
  saveUninitialized: true,
  cookie: {
    maxAge: 1000 * 60 * 60 * 24,
  },
};

app.use(session(sessionOptions));

app.use(flash());

app.use(passport.initialize());
app.use(passport.session());
passport.use(new LocalStrategy(User.authenticate()));
passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());

app.use((req, res, next) => {
  res.locals.success = req.flash("success");
  res.locals.error = req.flash("error");
  res.locals.path = req.path;
  res.locals.currentUser = req.user;
  next();
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

app.get("/", (req, res) => {
  res.render("index.ejs");
});

const isLoggedIn = (req, res, next) => {
  if (req.isAuthenticated()) {
    return next();
  }
  req.flash("error", "You must be logged in!");
  res.redirect("/login");
};

app.get("/hero", isLoggedIn, (req, res) => {
  res.render("hero.ejs", { newUser: req.user });
});

app.get("/signup", (req, res) => {
  res.render("signup.ejs");
});

app.post("/signup", async (req, res) => {
  try {
    const { username, email, password } = req.body;
    const newUser = new User({ username, email });

    const registeredUser = await User.register(newUser, password);

    let emailSent = false;
    let attempt = 0;
    const maxRetries = 5;

    while (!emailSent && attempt < maxRetries) {
      try {
        attempt++;
        const transporter = nodemailer.createTransport({
          service: "gmail",
          secure: true,
          port: 465,
          auth: {
            user: "trackthatgoal@gmail.com",
            pass: process.env.PAAS_KEY,
          },
        });
        const mailOptions = {
          from: "trackthatgoal@gmail.com",
          to: email,
          subject: "Email Verification",
          text: "You are successfully verified!",
        };
        await transporter.sendMail(mailOptions);
        emailSent = true;
      } catch (emailError) {
        console.error(`Attempt ${attempt} failed:`, emailError.message);

        if (attempt >= maxRetries) {
          await User.findByIdAndDelete(registeredUser._id);
          req.flash(
            "error",
            "Signup failed as the email could not be sent. Please try again."
          );
          return res.redirect("/signup");
        }
      }
    }
    req.flash(
      "success",
      "Signup successful! Please verify your email before logging in."
    );
    res.redirect("/login");
  } catch (err) {
    console.error(err);

    req.flash("error", "Signup failed. Please try again.");
    res.redirect("/signup");
  }
});

app.get("/login", (req, res) => {
  res.render("login.ejs");
});

app.post(
  "/login",
  passport.authenticate("local", {
    failureRedirect: "/login",
    failureFlash: true,
  }),
  (req, res) => {
    req.flash("success", "You are Successfully Logged In");
    res.redirect("/hero");
  }
);

app.post("/logout", (req, res) => {
  req.logout((err) => {
    if (err) {
      return next(err);
    }
    req.flash("success", "You have been logged out!");
    res.redirect("/");
  });
});

app.get("/goals", isLoggedIn, async (req, res) => {
  try {
    const goals = await Goal.find({ userId: req.user._id });
    res.render("goals.ejs", { goals, newUser: req.user });
  } catch (err) {
    console.error(err);
    req.flash("error", "Failed to fetch goals");
    res.redirect("/dashboard");
  }
});
app.post("/goals", isLoggedIn, async (req, res) => {
  try {
    const { title, why } = req.body;
    const newGoal = new Goal({
      title,
      why,
      userId: req.user._id,
    });
    await newGoal.save();
    req.flash("success", "New Goal Created");
    res.redirect("/dashboard");
  } catch (err) {
    console.error(err);
    req.flash("error", "Failed to create goal");
    res.redirect("/goals");
  }
});

app.get("/dashboard", isLoggedIn, async (req, res) => {
  try {
    const latestGoal = await Goal.findOne({ userId: req.user._id }).sort({
      createdAt: -1,
    });

    res.render("dashboard.ejs", { newUser: req.user, latestGoal });
  } catch (err) {
    console.error(err);
    req.flash("error", "Failed to load the dashboard");
    res.redirect("/goals");
  }
});

app.delete("/dashboard", isLoggedIn, async (req, res) => {
  try {
    const goalId = req.body.goalId;
    await Goal.findByIdAndDelete(goalId);
    req.flash("success", "Goal deleted successfully");
    res.redirect("/dashboard");
  } catch (err) {
    console.error("Error during deletion:", err.message);
    req.flash("error", "Failed to delete goal.");
    res.redirect("/dashboard");
  }
});

app.delete("/hero", isLoggedIn, async (req, res) => {
  try {
    const goalId = req.body.goalId;
    await Goal.findByIdAndDelete(goalId);
    req.flash("success", "Goal successfully completed");
    res.redirect("/hero");
  } catch (err) {
    console.error("Error during Completion:", err.message);
    req.flash("error", "Failed to Complete goal.");
    res.redirect("/dashboard");
  }
});

app.get("/learn-more", (req, res) => {
  res.render("learn.ejs");
});

app.get("/chart", isLoggedIn, (req, res) => {
  res.render("chart.ejs");
});