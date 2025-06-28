import Subscription from '../models/subscription.model.js'
import { workflowClient } from '../config/upstash.js'
import { SERVER_URL } from '../config/env.js'
import transporter, { accountEmail } from '../config/nodemailer.js' // <-- Add this
import { emailTemplates } from '../utils/email-template.js'
import dayjs from 'dayjs'

export const createSubscription = async (req, res, next) => {
  try {
    const subscription = await Subscription.create({
      ...req.body,
      user: req.user._id,
    });

    // Prepare template data
    const mailInfo = {
      userName: req.user.name,
      subscriptionName: subscription.name,
      renewalDate: dayjs(subscription.renewalDate).format('MMM D, YYYY'),
      planName: subscription.name,
      price: `${subscription.currency} ${subscription.price} (${subscription.frequency})`,
      paymentMethod: subscription.paymentMethod,
      accountSettingsLink: `${SERVER_URL}/account/settings`,
      supportLink: `${SERVER_URL}/support`,
      daysLeft: 30, // or calculate days left if needed
    };

    // Use the first template as an example
    const template = emailTemplates[0];
    const subject = template.generateSubject(mailInfo);
    const html = template.generateBody(mailInfo);

    const mailOptions = {
      from: accountEmail,
      to: req.user.email,
      subject,
      html,
    };

    await transporter.sendMail(mailOptions);
    console.log('Email sent to', req.user.email);

    const { workflowRunId } = await workflowClient.trigger({
      url: `${SERVER_URL}/api/v1/workflows/subscription/reminder`,
      body: {
        subscriptionId: subscription.id,
      },
      headers: {
        'content-type': 'application/json',
      },
      retries: 0,
    })

    res.status(201).json({ success: true, data: { subscription, workflowRunId } });
  } catch (e) {
    next(e);
  }
}

export const getUserSubscriptions = async (req, res, next) => {
  try {
    // Check if the user is the same as the one in the token
    if(req.user.id !== req.params.id) {
      const error = new Error('You are not the owner of this account');
      error.status = 401;
      throw error;
    }

    const subscriptions = await Subscription.find({ user: req.params.id });

    res.status(200).json({ success: true, data: subscriptions });
  } catch (e) {
    next(e);
  }
}