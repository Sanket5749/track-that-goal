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
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const User = require("./models/user");
const Goal = require("./models/goal");
const methodOverride = require("method-override");
const bodyParser = require("body-parser");
const http = require("http");
const nodemailer = require("nodemailer");

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

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: "/auth/google/callback",
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        let user = await User.findOne({ googleId: profile.id });

        if (!user) {
          user = new User({
            googleId: profile.id,
            username: profile.displayName,
            email: profile.emails[0].value,
          });
          await user.save();
        }

        done(null, user);
      } catch (err) {
        done(err, null);
      }
    }
  )
);

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (err) {
    done(err, null);
  }
});

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

app.get(
  "/auth/google",
  passport.authenticate("google", { scope: ["profile", "email"] })
);

app.get(
  "/auth/google/callback",
  passport.authenticate("google", {
    failureRedirect: "/login",
    failureFlash: true,
  }),
  (req, res) => {
    console.log("Redirecting to /hero after Google login");
    req.flash("success", "Successfully logged in with Google!");
    res.redirect("/hero");
  }
);

app.get("/signup", (req, res) => {
  res.render("signup.ejs");
});

app.post("/signup", async (req, res) => {
  try {
    const { username, email, password } = req.body;
    const newUser = new User({ username, email });

    const registeredUser = await User.register(newUser, password);

    req.flash("success", "Signup successful! Please log in.");
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

app.get("/hero", isLoggedIn, (req, res) => {
  res.render("hero.ejs", { newUser: req.user });
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
    const transport = nodemailer.createTransport({
      service: "gmail",
      secure: true,
      port: 465,
      auth: {
        user: process.env.EMAIL,
        pass: process.env.PASSWORD,
      },
    });
    const mailOptions = {
      from: process.env.EMAIL,
      to: req.user.email,
      subject: "New Goal Created",
      text: `You have created a new goal: ${title}. Why: ${why}. Stay focused, my friend, because dreams with a plan turn into unstoppable achievements! 🌟🚀`,
    };
    transport.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.error("Error sending email:", error.message);
      } else {
        console.log("Email sent:", info.response);
      }
    });
    res.redirect("/dashboard");
  } catch (err) {
    console.error(err);
    req.flash("error", "Failed to create goal");
    res.redirect("/goals");
  }
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
    const goal = await Goal.findById(goalId);
    if (!goal) {
      req.flash("error", "Goal not found!");
      return res.redirect("/dashboard");
    }
    await Goal.findByIdAndDelete(goalId);
    req.flash("success", "Goal deleted successfully");
    const transport = nodemailer.createTransport({
      service: "gmail",
      secure: true,
      port: 465,
      auth: {
        user: process.env.EMAIL,
        pass: process.env.PASSWORD,
      },
    });
    const mailOptions = {
      from: process.env.EMAIL,
      to: req.user.email,
      subject: "Goal Deleted",
      text: `The goal titled "${goal.title}" has been successfully deleted. But remember, my friend, every reset is just a chance to recharge—you're unstoppable, and your dreams are just warming up! 🌟💪
`,
    };
    transport.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.error("Error sending email:", error.message);
      } else {
        console.log("Email sent:", info.response);
      }
    });
    res.redirect("/dashboard");
  } catch (err) {
    console.error("Error during deletion:", err.message);
    req.flash("error", "Failed to delete goal.");
    res.redirect("/dashboard");
  }
});

app.get("/hero", isLoggedIn, async (req, res) => {
  try {
    const goals = await Goal.find({ userId: req.user._id });
    res.render("hero.ejs", { newUser: req.user, goals });
  } catch (err) {
    console.error(err);
    req.flash("error", "Failed to fetch goals");
    res.redirect("/dashboard");
  }
});

app.delete("/hero", isLoggedIn, async (req, res) => {
  try {
    const goalId = req.body.goalId;
    const goal = await Goal.findById(goalId);
    if (!goal) {
      req.flash("error", "Goal not found!");
      return res.redirect("/hero");
    }
    await Goal.findByIdAndDelete(goalId);
    req.flash("success", "Goal successfully completed");
    const transport = nodemailer.createTransport({
      service: "gmail",
      secure: true,
      port: 465,
      auth: {
        user: process.env.EMAIL,
        pass: process.env.PASSWORD,
      },
    });
    const mailOptions = {
      from: process.env.EMAIL,
      to: req.user.email,
      subject: "Goal Completed!",
      text: `Congratulations! Your goal titled "${goal.title}" has been successfully marked as completed. This is a big step forward, my friend—keep crushing it and chasing greatness like the champion you are! 🚀✨
`,
    };
    transport.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.error("Error sending email:", error.message);
      } else {
        console.log("Email sent:", info.response);
      }
    });
    res.redirect("/hero");
  } catch (err) {
    console.error("Error during completion:", err.message);
    req.flash("error", "Failed to complete goal.");
    res.redirect("/dashboard");
  }
});


app.get("/learn-more", (req, res) => {
  res.render("learn.ejs");
});

app.get("/chart", isLoggedIn, (req, res) => {
  res.render("chart.ejs");
});
